import { atom, useSetAtom, WritableAtom } from 'jotai';
import { MatrixClient, MatrixEvent, Room, RoomEvent, SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect } from 'react';
import { Membership, RoomTag } from '../../../types/matrix/room';
import { useSyncState } from '../../hooks/useSyncState';

export type TaggedRoomsAction =
  | { type: 'RESET'; rooms: Set<string> }
  | { type: 'PUT'; roomId: string }
  | { type: 'DELETE'; roomId: string };

export type TaggedRoomsAtom = WritableAtom<Set<string>, [TaggedRoomsAction], undefined>;

const makeTaggedRoomsAtom = (): TaggedRoomsAtom => {
  const baseAtom = atom(new Set<string>());
  return atom<Set<string>, [TaggedRoomsAction], undefined>(
    (get) => get(baseAtom),
    (get, set, action) => {
      if (action.type === 'RESET') {
        set(baseAtom, action.rooms);
        return;
      }
      const current = get(baseAtom);
      if (action.type === 'PUT') {
        if (current.has(action.roomId)) return;
        const next = new Set(current);
        next.add(action.roomId);
        set(baseAtom, next);
        return;
      }
      if (action.type === 'DELETE') {
        if (!current.has(action.roomId)) return;
        const next = new Set(current);
        next.delete(action.roomId);
        set(baseAtom, next);
      }
    }
  );
};

/** Rooms tagged m.favourite (pinned chats). */
export const favouriteRoomsAtom = makeTaggedRoomsAtom();
/** Rooms tagged m.lowpriority (archived chats, e.g. archived on WhatsApp). */
export const archivedRoomsAtom = makeTaggedRoomsAtom();

const getTaggedRooms = (mx: MatrixClient, tag: RoomTag): Set<string> => {
  const rooms = new Set<string>();
  mx.getRooms().forEach((room) => {
    if (room.tags[tag] !== undefined) rooms.add(room.roomId);
  });
  return rooms;
};

export const useBindTaggedRoomsAtom = (
  mx: MatrixClient,
  taggedRooms: TaggedRoomsAtom,
  tag: RoomTag
) => {
  const setTaggedRooms = useSetAtom(taggedRooms);

  useEffect(() => {
    setTaggedRooms({ type: 'RESET', rooms: getTaggedRooms(mx, tag) });
  }, [mx, setTaggedRooms, tag]);

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          (state === SyncState.Prepared && prevState === null) ||
          (state === SyncState.Syncing && prevState !== SyncState.Syncing)
        ) {
          setTaggedRooms({ type: 'RESET', rooms: getTaggedRooms(mx, tag) });
        }
      },
      [mx, setTaggedRooms, tag]
    )
  );

  useEffect(() => {
    const handleTags = (_event: MatrixEvent, room: Room) => {
      setTaggedRooms(
        room.tags[tag] !== undefined
          ? { type: 'PUT', roomId: room.roomId }
          : { type: 'DELETE', roomId: room.roomId }
      );
    };
    mx.on(RoomEvent.Tags, handleTags);
    return () => {
      mx.removeListener(RoomEvent.Tags, handleTags);
    };
  }, [mx, setTaggedRooms, tag]);

  useEffect(() => {
    const handleMembershipChange = (room: Room, membership: string) => {
      if (membership !== Membership.Join) {
        setTaggedRooms({ type: 'DELETE', roomId: room.roomId });
      }
    };
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    return () => {
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
    };
  }, [mx, setTaggedRooms]);
};
