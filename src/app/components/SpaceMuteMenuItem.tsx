import React from 'react';
import { Icon, Icons, MenuItem, Spinner, Text } from 'folds';
import { useToggleSpaceMute } from '../hooks/useRoomsNotificationPreferences';
import { AsyncStatus } from '../hooks/useAsyncCallback';

type SpaceMuteMenuItemProps = {
  spaceId: string;
  roomIds: string[];
  requestClose: () => void;
};

export function SpaceMuteMenuItem({ spaceId, roomIds, requestClose }: SpaceMuteMenuItemProps) {
  const { allMuted, toggleState, toggleMute } = useToggleSpaceMute(spaceId, roomIds);
  const changing = toggleState.status === AsyncStatus.Loading;
  const failed = toggleState.status === AsyncStatus.Error;

  const handleClick = () => {
    toggleMute().then(requestClose, () => {
      // failure is shown in the menu item
    });
  };

  const label = allMuted ? 'Unmute Rooms' : 'Mute Rooms';

  return (
    <MenuItem
      onClick={handleClick}
      size="300"
      variant={failed ? 'Critical' : 'Surface'}
      fill="None"
      after={
        changing ? (
          <Spinner size="100" variant="Secondary" />
        ) : (
          <Icon size="100" src={allMuted ? Icons.Bell : Icons.BellMute} />
        )
      }
      radii="300"
      disabled={changing || roomIds.length === 0}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {failed ? `${label} Failed` : label}
      </Text>
    </MenuItem>
  );
}
