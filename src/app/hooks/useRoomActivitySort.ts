import { useEffect, useMemo, useState } from 'react';
import { IRoomTimelineData, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { factoryRoomIdByActivity, SortFunc } from '../utils/sort';

/**
 * "Latest activity first" room sort whose identity changes whenever a new live event lands in
 * any room (including own messages, which do not mark a room unread), so memoized room lists
 * using it re-sort like a messenger chat list. Bursts (e.g. sync catch-up) are batched.
 */
export const useRoomActivitySort = (): SortFunc<string> => {
  const mx = useMatrixClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timeout: number | undefined;
    const handleTimeline = (
      mEvent: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (!room || toStartOfTimeline || removed || !data.liveEvent || timeout) return;
      timeout = window.setTimeout(() => {
        timeout = undefined;
        setTick((t) => t + 1);
      }, 300);
    };
    mx.on(RoomEvent.Timeline, handleTimeline);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimeline);
      clearTimeout(timeout);
    };
  }, [mx]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the re-sort trigger
  return useMemo(() => factoryRoomIdByActivity(mx), [mx, tick]);
};
