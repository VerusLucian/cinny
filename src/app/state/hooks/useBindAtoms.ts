import { MatrixClient } from 'matrix-js-sdk';
import { allInvitesAtom, useBindAllInvitesAtom } from '../room-list/inviteList';
import { allRoomsAtom, useBindAllRoomsAtom } from '../room-list/roomList';
import { mDirectAtom, useBindMDirectAtom } from '../mDirectList';
import { roomToUnreadAtom, useBindRoomToUnreadAtom } from '../room/roomToUnread';
import { archivedRoomsAtom, favouriteRoomsAtom, useBindTaggedRoomsAtom } from '../room/taggedRooms';
import { RoomTag } from '../../../types/matrix/room';
import { roomToParentsAtom, useBindRoomToParentsAtom } from '../room/roomToParents';
import { roomIdToTypingMembersAtom, useBindRoomIdToTypingMembersAtom } from '../typingMembers';

export const useBindAtoms = (mx: MatrixClient) => {
  useBindMDirectAtom(mx, mDirectAtom);
  useBindAllInvitesAtom(mx, allInvitesAtom);
  useBindAllRoomsAtom(mx, allRoomsAtom);
  useBindRoomToParentsAtom(mx, roomToParentsAtom);
  useBindRoomToUnreadAtom(mx, roomToUnreadAtom);
  useBindTaggedRoomsAtom(mx, favouriteRoomsAtom, RoomTag.Favourite);
  useBindTaggedRoomsAtom(mx, archivedRoomsAtom, RoomTag.LowPriority);

  useBindRoomIdToTypingMembersAtom(mx, roomIdToTypingMembersAtom);
};
