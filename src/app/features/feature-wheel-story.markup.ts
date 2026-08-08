// Both halves of the wheel story, wrapped — what /home-classic renders.
//
// Byte-identical to the single string this module used to hold; the split is
// asserted in scripts/split-wheel-markup.mjs. Import the halves directly
// (wheel-story-markup / command-center-markup) to render one without the other.
import { WHEEL_STORY_MARKUP } from './wheel-story-markup';
import { COMMAND_CENTER_MARKUP } from './command-center-markup';

export { WHEEL_STORY_MARKUP, COMMAND_CENTER_MARKUP };

export const FEATURE_WHEEL_MARKUP =
  '<div class="fw-scope">' + WHEEL_STORY_MARKUP + COMMAND_CENTER_MARKUP + '</div>';
