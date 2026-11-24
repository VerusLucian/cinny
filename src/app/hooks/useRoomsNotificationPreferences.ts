import { createContext, useCallback, useContext, useMemo } from 'react';
import { ConditionKind, IPushRules, MatrixClient, PushRuleKind } from 'matrix-js-sdk';
import { Icons, IconSrc } from 'folds';
import {
  AccountDataEvent,
  SPACE_MUTE_ACCOUNT_DATA,
  SpaceMuteContent,
} from '../../types/matrix/accountData';
import { useAccountData } from './useAccountData';
import { isRoomId } from '../utils/matrix';
import {
  getNotificationMode,
  getNotificationModeActions,
  NotificationMode,
} from './useNotificationMode';
import { useAsyncCallback } from './useAsyncCallback';
import { useMatrixClient } from './useMatrixClient';

export type RoomsNotificationPreferences = {
  mute: Set<string>;
  specialMessages: Set<string>;
  allMessages: Set<string>;
};

const RoomsNotificationPreferencesContext = createContext<RoomsNotificationPreferences | null>(
  null
);
export const RoomsNotificationPreferencesProvider = RoomsNotificationPreferencesContext.Provider;

export const useRoomsNotificationPreferencesContext = (): RoomsNotificationPreferences => {
  const preferences = useContext(RoomsNotificationPreferencesContext);

  if (!preferences) {
    throw new Error('No RoomsNotificationPreferences provided!');
  }

  return preferences;
};

export const useRoomsNotificationPreferences = (): RoomsNotificationPreferences => {
  const pushRules = useAccountData(AccountDataEvent.PushRules)?.getContent<IPushRules>();

  const preferences: RoomsNotificationPreferences = useMemo(() => {
    const global = pushRules?.global;
    const room = global?.room ?? [];
    const override = global?.override ?? [];

    const pref: RoomsNotificationPreferences = {
      mute: new Set(),
      specialMessages: new Set(),
      allMessages: new Set(),
    };

    override.forEach((rule) => {
      if (isRoomId(rule.rule_id) && getNotificationMode(rule.actions) === NotificationMode.OFF) {
        pref.mute.add(rule.rule_id);
      }
    });
    room.forEach((rule) => {
      if (getNotificationMode(rule.actions) === NotificationMode.OFF) {
        pref.specialMessages.add(rule.rule_id);
      }
    });
    room.forEach((rule) => {
      if (getNotificationMode(rule.actions) !== NotificationMode.OFF) {
        pref.allMessages.add(rule.rule_id);
      }
    });

    return pref;
  }, [pushRules]);

  return preferences;
};

export enum RoomNotificationMode {
  Unset = 'Unset',
  Mute = 'Mute',
  SpecialMessages = 'SpecialMessages',
  AllMessages = 'AllMessages',
}

export const getRoomNotificationMode = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode => {
  if (preferences.mute.has(roomId)) {
    return RoomNotificationMode.Mute;
  }
  if (preferences.specialMessages.has(roomId)) {
    return RoomNotificationMode.SpecialMessages;
  }
  if (preferences.allMessages.has(roomId)) {
    return RoomNotificationMode.AllMessages;
  }

  return RoomNotificationMode.Unset;
};

export const useRoomNotificationPreference = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode =>
  useMemo(() => getRoomNotificationMode(preferences, roomId), [preferences, roomId]);

export const getRoomNotificationModeIcon = (mode?: RoomNotificationMode): IconSrc => {
  if (mode === RoomNotificationMode.Mute) return Icons.BellMute;
  if (mode === RoomNotificationMode.SpecialMessages) return Icons.BellPing;
  if (mode === RoomNotificationMode.AllMessages) return Icons.BellRing;

  return Icons.Bell;
};

const addRoomMuteRule = (mx: MatrixClient, roomId: string) =>
  mx.addPushRule('global', PushRuleKind.Override, roomId, {
    conditions: [
      {
        kind: ConditionKind.EventMatch,
        key: 'room_id',
        pattern: roomId,
      },
    ],
    actions: getNotificationModeActions(NotificationMode.OFF),
  });

const hasRoomRule = (mx: MatrixClient, roomId: string): boolean =>
  (mx.pushRules?.global?.room ?? []).some((rule) => rule.rule_id === roomId);

const isSpaceMuteContent = (content: object): content is SpaceMuteContent =>
  Object.values(content).every(
    (roomIds) => Array.isArray(roomIds) && roomIds.every((id) => typeof id === 'string')
  );

const getSpaceMuteContent = (mx: MatrixClient): SpaceMuteContent => {
  const stored: object | undefined = mx.getAccountData(SPACE_MUTE_ACCOUNT_DATA)?.getContent();
  return stored && isSpaceMuteContent(stored) ? stored : {};
};

/** Copy of the record without `roomIds`; spaces left without recorded rooms are dropped. */
const withoutRecordedRooms = (
  content: SpaceMuteContent,
  roomIds: ReadonlySet<string>
): SpaceMuteContent => {
  const result: SpaceMuteContent = {};
  Object.entries(content).forEach(([spaceId, recorded]) => {
    const remaining = recorded.filter((roomId) => !roomIds.has(roomId));
    if (remaining.length > 0) result[spaceId] = remaining;
  });
  return result;
};

/**
 * A room whose notification setting is changed individually is no longer owned by the space
 * mute, so "Unmute Rooms" must not touch it afterwards.
 */
const forgetSpaceMute = async (mx: MatrixClient, roomId: string) => {
  const content = getSpaceMuteContent(mx);
  if (!Object.values(content).some((recorded) => recorded.includes(roomId))) return;
  await mx.setAccountData(
    SPACE_MUTE_ACCOUNT_DATA,
    withoutRecordedRooms(content, new Set([roomId]))
  );
};

export const setRoomNotificationPreference = async (
  mx: MatrixClient,
  roomId: string,
  mode: RoomNotificationMode,
  previousMode: RoomNotificationMode
): Promise<void> => {
  if (previousMode === RoomNotificationMode.Mute || mode === RoomNotificationMode.Mute) {
    await forgetSpaceMute(mx, roomId);
  }

  // remove the old preference
  if (
    previousMode === RoomNotificationMode.AllMessages ||
    previousMode === RoomNotificationMode.SpecialMessages
  ) {
    await mx.deletePushRule('global', PushRuleKind.RoomSpecific, roomId);
  }
  if (previousMode === RoomNotificationMode.Mute) {
    await mx.deletePushRule('global', PushRuleKind.Override, roomId);
    // A room muted together with its space keeps its own room rule underneath the mute.
    if (mode === RoomNotificationMode.Unset && hasRoomRule(mx, roomId)) {
      await mx.deletePushRule('global', PushRuleKind.RoomSpecific, roomId);
    }
  }

  // set new preference
  if (mode === RoomNotificationMode.Unset) {
    return;
  }

  if (mode === RoomNotificationMode.Mute) {
    await addRoomMuteRule(mx, roomId);
    return;
  }

  await mx.addPushRule('global', PushRuleKind.RoomSpecific, roomId, {
    actions:
      mode === RoomNotificationMode.AllMessages
        ? getNotificationModeActions(NotificationMode.NotifyLoud)
        : getNotificationModeActions(NotificationMode.OFF),
  });
};

export const useSetRoomNotificationPreference = (roomId: string) => {
  const mx = useMatrixClient();

  const [modeState, setMode] = useAsyncCallback(
    useCallback(
      (mode: RoomNotificationMode, previousMode: RoomNotificationMode) =>
        setRoomNotificationPreference(mx, roomId, mode, previousMode),
      [mx, roomId]
    )
  );

  return {
    modeState,
    setMode,
  };
};

const runSequentially = (roomIds: string[], action: (roomId: string) => Promise<unknown>) =>
  roomIds.reduce<Promise<void>>(async (previous, roomId) => {
    await previous;
    await action(roomId);
  }, Promise.resolve());

/**
 * Mute or unmute every room of a space at once.
 * Muting only adds an override rule, so per-room "All Messages" / "Mention & Keywords" rules
 * stay in place underneath and come back on unmute. Rooms muted by the space are recorded in
 * account data, so unmuting leaves rooms that were muted individually before untouched.
 * Requests run sequentially to stay under homeserver rate limits.
 */
export const useToggleSpaceMute = (spaceId: string, roomIds: string[]) => {
  const mx = useMatrixClient();
  const preferences = useRoomsNotificationPreferencesContext();

  const allMuted = roomIds.length > 0 && roomIds.every((roomId) => preferences.mute.has(roomId));

  const [toggleState, toggleMute] = useAsyncCallback(
    useCallback(async () => {
      const content = getSpaceMuteContent(mx);
      const recorded = content[spaceId];

      if (!allMuted) {
        const toMute = roomIds.filter((roomId) => !preferences.mute.has(roomId));
        // record before muting, so a partially failed mute can still be undone
        await mx.setAccountData(SPACE_MUTE_ACCOUNT_DATA, {
          ...content,
          [spaceId]: Array.from(new Set([...(recorded ?? []), ...toMute])),
        });
        await runSequentially(toMute, (roomId) => addRoomMuteRule(mx, roomId));
        return;
      }

      // Unmute what the space muted. Without a record (muted by an older version) or when none
      // of its rooms is still muted by the space, every room was muted by hand and the whole
      // space is unmuted at once, so a single click always has the same effect.
      const spaceRoomIds = new Set(roomIds);
      const mutedBySpace = (recorded ?? []).filter(
        (roomId) => spaceRoomIds.has(roomId) && preferences.mute.has(roomId)
      );
      const toUnmute = mutedBySpace.length > 0 ? mutedBySpace : roomIds;
      await runSequentially(toUnmute, (roomId) =>
        mx.deletePushRule('global', PushRuleKind.Override, roomId)
      );
      const newContent = withoutRecordedRooms(content, new Set(toUnmute));
      delete newContent[spaceId];
      await mx.setAccountData(SPACE_MUTE_ACCOUNT_DATA, newContent);
    }, [mx, spaceId, roomIds, preferences, allMuted])
  );

  return {
    allMuted,
    toggleState,
    toggleMute,
  };
};
