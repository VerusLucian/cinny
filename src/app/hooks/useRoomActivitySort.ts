import { useEffect, useState } from 'react';
import { IRoomTimelineData, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { factoryRoomIdByActivity, SortFunc } from '../utils/sort';

/**
 * "Latest activity first" room sort whose identity changes whenever the latest activity of a
 * room changes (including own messages, which do not mark a room unread), so memoized room
 * lists using it re-sort like a messenger chat list. Space rooms are never listed by activity
 * and events that leave the activity timestamp untouched (e.g. late or edited events) do not
 * count. Bursts (e.g. sync catch-up) are batched.
 */
export const useRoomActivitySort = (): SortFunc<string> => {
  const mx = useMatrixClient();
  const [sort, setSort] = useState(() => factoryRoomIdByActivity(mx));

  useEffect(() => {
    let timeout: number | undefined;
    const seenActivity = new Map<string, number>();
    const handleTimeline = (
      mEvent: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (!room || toStartOfTimeline || removed || !data.liveEvent || room.isSpaceRoom()) return;
      const activity = room.getLastActiveTimestamp();
      if (seenActivity.get(room.roomId) === activity) return;
      seenActivity.set(room.roomId, activity);
      if (timeout) return;
      timeout = window.setTimeout(() => {
        timeout = undefined;
        // a fresh comparator identity makes memoized lists re-sort
        setSort(() => factoryRoomIdByActivity(mx));
      }, 300);
    };
    mx.on(RoomEvent.Timeline, handleTimeline);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimeline);
      clearTimeout(timeout);
    };
  }, [mx]);

  return sort;
};
