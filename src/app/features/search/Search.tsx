import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  config,
  Icon,
  Icons,
  Input,
  Line,
  MenuItem,
  Modal,
  Overlay,
  OverlayCenter,
  Scroll,
  Text,
  toRem,
} from 'folds';
import React, {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { matchPath, useLocation } from 'react-router-dom';
import { useAtom, useAtomValue } from 'jotai';
import { Room } from 'matrix-js-sdk';
import { useDirects, useOrphanSpaces, useRooms, useSpaces } from '../../state/hooks/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import {
  SearchItemStrGetter,
  useAsyncSearch,
  UseAsyncSearchOptions,
} from '../../hooks/useAsyncSearch';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import {
  getAllParents,
  getDirectRoomAvatarUrl,
  getRoomAvatarUrl,
  guessPerfectParent,
} from '../../utils/room';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { nameInitials } from '../../utils/common';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useListFocusIndex } from '../../hooks/useListFocusIndex';
import {
  getCanonicalAliasRoomId,
  getMxIdLocalPart,
  getMxIdServer,
  guessDmRoomUserId,
  isRoomAlias,
} from '../../utils/matrix';
import { SPACE_PATH } from '../../pages/paths';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { searchModalAtom, searchScopeAtom } from '../../state/searchModal';
import { useKeyDown } from '../../hooks/useKeyDown';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { KeySymbol } from '../../utils/key-symbol';
import { isMacOS } from '../../utils/user-agent';

enum SearchRoomType {
  Rooms = '#',
  Spaces = '*',
  Directs = '@',
}

const getSearchPrefixToRoomType = (prefix: string): SearchRoomType | undefined => {
  if (prefix === '#') return SearchRoomType.Rooms;
  if (prefix === '*') return SearchRoomType.Spaces;
  if (prefix === '@') return SearchRoomType.Directs;
  return undefined;
};

const useTopActiveRooms = (
  searchRoomType: SearchRoomType | undefined,
  rooms: string[],
  directs: string[],
  spaces: string[]
) => {
  const mx = useMatrixClient();

  return useMemo(() => {
    if (searchRoomType === SearchRoomType.Spaces) {
      return spaces;
    }
    if (searchRoomType === SearchRoomType.Directs) {
      return [...directs].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
    }
    if (searchRoomType === SearchRoomType.Rooms) {
      return [...rooms].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
    }
    return [...rooms, ...directs].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
  }, [mx, rooms, directs, spaces, searchRoomType]);
};

const getDmUserId = (
  roomId: string,
  getRoom: (roomId: string) => Room | undefined,
  myUserId: string
): string | undefined => {
  const room = getRoom(roomId);
  const targetUserId = room && guessDmRoomUserId(room, myUserId);
  return targetUserId;
};

const useSearchTargetRooms = (
  searchRoomType: SearchRoomType | undefined,
  rooms: string[],
  directs: string[],
  spaces: string[]
) =>
  useMemo(() => {
    if (searchRoomType === undefined) {
      return [...rooms, ...directs, ...spaces];
    }
    if (searchRoomType === SearchRoomType.Rooms) return rooms;
    if (searchRoomType === SearchRoomType.Spaces) return spaces;
    if (searchRoomType === SearchRoomType.Directs) return directs;

    return [];
  }, [rooms, spaces, directs, searchRoomType]);

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
  normalizeOptions: {
    ignoreWhitespace: false,
  },
};

type SearchProps = {
  requestClose: () => void;
  /** Limit results to the rooms and direct messages of this space (including sub-spaces). */
  scopeSpaceId?: string;
};
export function Search({ requestClose, scopeSpaceId }: SearchProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  const [searchRoomType, setSearchRoomType] = useState<SearchRoomType>();

  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);

  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useRooms(mx, allRoomsAtom, mDirects);
  const allSpaces = useSpaces(mx, allRoomsAtom);
  const allDirects = useDirects(mx, allRoomsAtom, mDirects);

  const [rooms, spaces, directs] = useMemo(() => {
    if (!scopeSpaceId) return [allRooms, allSpaces, allDirects];
    const inScope = (roomId: string) => getAllParents(roomToParents, roomId).has(scopeSpaceId);
    return [allRooms.filter(inScope), allSpaces.filter(inScope), allDirects.filter(inScope)];
  }, [scopeSpaceId, roomToParents, allRooms, allSpaces, allDirects]);
  const scopeName = scopeSpaceId ? getRoom(scopeSpaceId)?.name : undefined;

  const topActiveRooms = useTopActiveRooms(searchRoomType, rooms, directs, spaces);
  const targetRooms = useSearchTargetRooms(searchRoomType, rooms, directs, spaces);

  const getTargetStr: SearchItemStrGetter<string> = useCallback(
    (roomId: string) => {
      const roomName = getRoom(roomId)?.name ?? roomId;
      if (mDirects.has(roomId)) {
        const targetUserId = getDmUserId(roomId, getRoom, mx.getSafeUserId());
        const targetUsername = targetUserId && getMxIdLocalPart(targetUserId);
        if (targetUsername) return [roomName, targetUsername];
      }
      return roomName;
    },
    [getRoom, mDirects, mx]
  );

  const [result, search, resetSearch] = useAsyncSearch(targetRooms, getTargetStr, SEARCH_OPTIONS);
  const roomsToRender = result ? result.items : topActiveRooms;
  const listFocus = useListFocusIndex(roomsToRender.length, 0);

  const queryHighlighRegex = result?.query
    ? makeHighlightRegex(result.query.split(' '))
    : undefined;

  const openRoomId = (roomId: string, isSpace: boolean) => {
    if (isSpace) navigateSpace(roomId);
    else navigateRoom(roomId);
    requestClose();
  };

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    listFocus.reset();

    const target = evt.currentTarget;
    let value = target.value.trim();
    const prefix = value.match(/^[#@*]/)?.[0];
    const searchType = typeof prefix === 'string' && getSearchPrefixToRoomType(prefix);
    if (searchType) {
      value = value.slice(1);
      setSearchRoomType(searchType);
    } else {
      setSearchRoomType(undefined);
    }

    if (value === '') {
      resetSearch();
      return;
    }
    search(value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    const roomId = roomsToRender[listFocus.index];
    if (isKeyHotkey('enter', evt) && roomId) {
      openRoomId(roomId, spaces.includes(roomId));
      return;
    }
    if (isKeyHotkey('arrowdown', evt)) {
      evt.preventDefault();
      listFocus.next();
      return;
    }
    if (isKeyHotkey('arrowup', evt)) {
      evt.preventDefault();
      listFocus.previous();
    }
  };

  const handleRoomClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const target = evt.currentTarget;
    const roomId = target.getAttribute('data-room-id');
    const isSpace = target.getAttribute('data-space') === 'true';
    if (!roomId) return;
    openRoomId(roomId, isSpace);
  };

  useEffect(() => {
    const scrollView = scrollRef.current;
    const focusedItem = scrollView?.querySelector(`[data-focus-index="${listFocus.index}"]`);

    if (focusedItem && scrollView) {
      focusedItem.scrollIntoView({
        block: 'center',
      });
    }
  }, [listFocus.index]);

  return (
    <Overlay open>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: () => inputRef.current,
            returnFocusOnDeactivate: false,
            allowOutsideClick: true,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: (evt) => {
              evt.stopPropagation();
              return true;
            },
          }}
        >
          <Modal size="400" style={{ maxHeight: toRem(400), borderRadius: config.radii.R500 }}>
            <Box
              shrink="No"
              style={{ padding: config.space.S400, paddingBottom: 0 }}
              direction="Column"
            >
              <Input
                ref={inputRef}
                size="500"
                variant="Background"
                radii="400"
                outlined
                placeholder={scopeName ? `Search in ${scopeName}` : 'Search'}
                before={<Icon size="200" src={Icons.Search} />}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
              />
            </Box>
            <Box grow="Yes">
              {roomsToRender.length === 0 && (
                <Box
                  style={{ paddingTop: config.space.S700 }}
                  grow="Yes"
                  alignItems="Center"
                  justifyContent="Center"
                  direction="Column"
                  gap="100"
                >
                  <Text size="H6" align="Center">
                    {result ? 'No Match Found' : 'No Rooms'}
                  </Text>
                  <Text size="T200" align="Center">
                    {result
                      ? `No match found for "${result.query}".`
                      : `You do not have any Rooms to display yet.`}
                  </Text>
                </Box>
              )}
              {roomsToRender.length > 0 && (
                <Scroll ref={scrollRef} size="300" hideTrack>
                  <div style={{ padding: config.space.S400, paddingRight: config.space.S200 }}>
                    {roomsToRender.map((roomId, index) => {
                      const room = getRoom(roomId);
                      if (!room) return null;

                      const dm = mDirects.has(roomId);
                      const dmUserId = dm && getDmUserId(roomId, getRoom, mx.getSafeUserId());
                      const dmUsername = dmUserId && getMxIdLocalPart(dmUserId);
                      const dmUserServer = dmUserId && getMxIdServer(dmUserId);

                      const allParents = getAllParents(roomToParents, roomId);
                      const orphanParents =
                        allParents && orphanSpaces.filter((o) => allParents.has(o));
                      const perfectOrphanParent =
                        orphanParents && guessPerfectParent(mx, roomId, orphanParents);

                      const exactParents = roomToParents.get(roomId);
                      const perfectParent =
                        exactParents && guessPerfectParent(mx, roomId, Array.from(exactParents));

                      const unread = roomToUnread.get(roomId);

                      return (
                        <MenuItem
                          key={roomId}
                          as="button"
                          data-focus-index={index}
                          data-room-id={roomId}
                          data-space={room.isSpaceRoom()}
                          onClick={handleRoomClick}
                          variant={listFocus.index === index ? 'Primary' : 'Surface'}
                          aria-pressed={listFocus.index === index}
                          radii="400"
                          after={
                            <Box gap="100">
                              {dmUserServer && !perfectOrphanParent && (
                                <Text size="T200" priority="300" truncate>
                                  <b>{dmUserServer}</b>
                                </Text>
                              )}
                              {perfectOrphanParent && (
                                <Text size="T200" priority="300" truncate>
                                  <b>{getRoom(perfectOrphanParent)?.name ?? perfectOrphanParent}</b>
                                </Text>
                              )}
                              {unread && (
                                <UnreadBadgeCenter>
                                  <UnreadBadge
                                    highlight={unread.highlight > 0}
                                    count={unread.total}
                                  />
                                </UnreadBadgeCenter>
                              )}
                            </Box>
                          }
                          before={
                            <Avatar size="200" radii={dm ? '400' : '300'}>
                              {dm || room.isSpaceRoom() ? (
                                <RoomAvatar
                                  roomId={room.roomId}
                                  src={
                                    dm
                                      ? getDirectRoomAvatarUrl(mx, room, 32, useAuthentication)
                                      : getRoomAvatarUrl(mx, room, 32, useAuthentication)
                                  }
                                  alt={room.name}
                                  renderFallback={() => (
                                    <Text as="span" size="H6">
                                      {nameInitials(room.name)}
                                    </Text>
                                  )}
                                />
                              ) : (
                                <RoomIcon
                                  size="100"
                                  joinRule={room.getJoinRule()}
                                  roomType={room.getType()}
                                />
                              )}
                            </Avatar>
                          }
                        >
                          <Box grow="Yes" alignItems="Center" gap="100">
                            <Text size="T400" truncate>
                              {queryHighlighRegex
                                ? highlightText(queryHighlighRegex, [room.name])
                                : room.name}
                            </Text>
                            {dmUsername && (
                              <Text as="span" size="T200" priority="300" truncate>
                                @
                                {queryHighlighRegex
                                  ? highlightText(queryHighlighRegex, [dmUsername])
                                  : dmUsername}
                              </Text>
                            )}
                            {!dm && perfectParent && perfectParent !== perfectOrphanParent && (
                              <Text size="T200" priority="300" truncate>
                                — {getRoom(perfectParent)?.name ?? perfectParent}
                              </Text>
                            )}
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </div>
                </Scroll>
              )}
            </Box>
            <Line size="300" />
            <Box shrink="No" justifyContent="Center" style={{ padding: config.space.S200 }}>
              <Text size="T200" priority="300">
                Type <b>#</b> for rooms, <b>@</b> for DMs and <b>*</b> for spaces. Hotkey:{' '}
                <b>{isMacOS() ? KeySymbol.Command : 'Ctrl'} + k</b>, <b>Shift Shift</b> for the
                current space
              </Text>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

/** Joined space currently open in the URL (/:spaceIdOrAlias/...), if any. */
const useOpenSpaceId = (): string | undefined => {
  const mx = useMatrixClient();
  const { pathname } = useLocation();
  const spaceIdOrAlias = matchPath({ path: SPACE_PATH, end: false }, pathname)?.params
    .spaceIdOrAlias;
  if (!spaceIdOrAlias) return undefined;
  const roomId = isRoomAlias(spaceIdOrAlias)
    ? getCanonicalAliasRoomId(mx, spaceIdOrAlias)
    : spaceIdOrAlias;
  return roomId && mx.getRoom(roomId)?.isSpaceRoom() ? roomId : undefined;
};

// Max gap between the two Shift presses of the quick switcher hotkey.
const DOUBLE_SHIFT_MS = 400;

export function SearchModalRenderer() {
  const [opened, setOpen] = useAtom(searchModalAtom);
  const [scope, setScope] = useAtom(searchScopeAtom);
  const openSpaceId = useOpenSpaceId();
  const lastShiftRef = useRef(0);

  const toggle = useCallback(
    (scopeSpaceId: string | undefined) => {
      if (opened) {
        setOpen(false);
        setScope(undefined);
        return;
      }
      const portalContainer = document.getElementById('portalContainer');
      if (portalContainer && portalContainer.children.length > 0) {
        return;
      }
      setScope(scopeSpaceId);
      setOpen(true);
    },
    [opened, setOpen, setScope]
  );

  useKeyDown(
    window,
    useCallback(
      (event) => {
        if (isKeyHotkey('mod+k', event)) {
          event.preventDefault();
          toggle(undefined);
          return;
        }
        // Shift pressed twice on its own: search the open space (everything outside spaces).
        const loneShift =
          event.key === 'Shift' &&
          !event.repeat &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey;
        if (!loneShift) {
          lastShiftRef.current = 0;
          return;
        }
        const now = Date.now();
        if (now - lastShiftRef.current <= DOUBLE_SHIFT_MS) {
          lastShiftRef.current = 0;
          toggle(openSpaceId);
          return;
        }
        lastShiftRef.current = now;
      },
      [toggle, openSpaceId]
    )
  );

  return (
    opened && (
      <Search
        scopeSpaceId={scope}
        requestClose={() => {
          setOpen(false);
          setScope(undefined);
        }}
      />
    )
  );
}
