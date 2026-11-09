# breathing-session Specification

## Purpose

Owns the guided breathing session behavior: the phase engine that drives inhale/hold/exhale cycles, the cyclic presets (Balanced Breathing, the default, Box Breathing, and 4-6-7 Breathing), session controls (start/pause/resume/reset), and the continuous session signal (current phase, phase progress, lung-fill level) from which the visual display is derived. This is the foundation other presets, timing options, tick/audio feedback, and multi-phase flows (e.g. Breath Retention) will extend.

## Requirements

### Requirement: 4-6-7 preset session playback
The system SHALL run guided 4-6-7 breathing sessions consisting of an inhale phase of 4 counts, a hold phase of 6 counts (lungs full), and an exhale phase of 7 counts, repeating the cycle until the user stops the session. One count lasts one real second at Normal tempo.

#### Scenario: Cycle order and durations
- **WHEN** a session is running
- **THEN** the phases advance in the order inhale (4 counts) → hold (6 counts) → exhale (7 counts), repeating

#### Scenario: Indefinite loop
- **WHEN** the last phase of a cycle ends and the user has not stopped the session
- **THEN** the next cycle begins with the inhale phase

### Requirement: Available cyclic preset choices
The system SHALL let the user choose Balanced Breathing, Box Breathing, 4-6-7 Breathing, or Breath Retention, listed in that order from simplest to most involved, and SHALL select Balanced Breathing by default. Box Breathing and Balanced Breathing SHALL each appear once; their phase length is chosen with the tempo control.

#### Scenario: Default preset is selected
- **WHEN** the app is opened with no prior selection
- **THEN** Balanced Breathing is selected

#### Scenario: Preset choices are presented
- **WHEN** the user views the preset control
- **THEN** it offers Balanced Breathing, Box Breathing, 4-6-7 Breathing, and Breath Retention, in that order

### Requirement: Box Breathing preset playback
The system SHALL run Box Breathing as a repeating four-phase cycle with equal-duration inhale, full-lung hold, exhale, and empty-lung hold phases. Each phase SHALL last the phase length selected with the tempo control: 3, 4, 5, 7, or 8 real seconds, with one count per real second.

#### Scenario: Four-second Box Breathing
- **WHEN** the user starts Box Breathing at 4 s per phase
- **THEN** the cycle is inhale 4 s, full-lung hold 4 s, exhale 4 s, empty-lung hold 4 s, then repeats

#### Scenario: Five-second Box Breathing
- **WHEN** the user starts Box Breathing at 5 s per phase
- **THEN** the cycle is inhale 5 s, full-lung hold 5 s, exhale 5 s, empty-lung hold 5 s, then repeats

#### Scenario: Seven-second Box Breathing
- **WHEN** the user starts Box Breathing at 7 s per phase
- **THEN** the cycle is inhale 7 s, full-lung hold 7 s, exhale 7 s, empty-lung hold 7 s, then repeats

#### Scenario: Three- and eight-second Box Breathing
- **WHEN** the user starts Box Breathing at 3 s or 8 s per phase
- **THEN** each of the four phases lasts 3 s or 8 s respectively, then the cycle repeats

### Requirement: Balanced Breathing preset playback
The system SHALL run Balanced Breathing as a repeating two-phase cycle of an inhale and an exhale of equal length, with no holds. Each phase SHALL last the phase length selected with the tempo control: 4, 5, 5.5, 6, or 7 real seconds.

#### Scenario: Default Balanced Breathing
- **WHEN** the user starts Balanced Breathing at 5.5 s per phase
- **THEN** the cycle is inhale 5.5 s, exhale 5.5 s, then repeats

#### Scenario: Whole-second Balanced Breathing
- **WHEN** the user starts Balanced Breathing at 4, 5, 6, or 7 s per phase
- **THEN** the inhale and the exhale each last that many seconds, then the cycle repeats

#### Scenario: No holds
- **WHEN** a Balanced Breathing session runs
- **THEN** the inhale is followed directly by the exhale and the exhale directly by the next inhale

### Requirement: Selected preset applies to a new session
The system SHALL use the selected preset when a session starts and SHALL keep the active preset unchanged while the session is running or paused.

#### Scenario: Start uses selected preset
- **WHEN** the user selects a preset while idle and starts a session
- **THEN** the session begins with the inhale phase and timing of that preset

#### Scenario: Selection cannot alter an active session
- **WHEN** a session is running or paused
- **THEN** the preset control is unavailable and the active session continues with its current preset

#### Scenario: Reset preserves selection
- **WHEN** the user resets a session
- **THEN** the session returns to idle and the selected preset remains selected for the next start

### Requirement: Playback tempo selection
The system SHALL show a control captioned Tempo whose choices depend on the selected pattern. For 4-6-7 and Breath Retention it SHALL offer Fast, Normal, and Slow, listed in that order from fastest to slowest, which set the real duration of one count to 0.8 s, 1 s, and 1.25 s, defaulting to Normal; 4-6-7 SHALL show the length of one count in each choice, Breath Retention only the name. When a choice shows both a speed and a number, the speed SHALL decide its place in the list.

#### Scenario: Default tempo is Normal
- **WHEN** 4-6-7 or Breath Retention is selected for the first time
- **THEN** the Normal tempo is selected and one count lasts one real second

#### Scenario: Tempo choices are presented
- **WHEN** the user views the tempo control while 4-6-7 or Breath Retention is selected
- **THEN** it offers Fast, Normal, and Slow, in that order from top to bottom

#### Scenario: Labels with count length
- **WHEN** the 4-6-7 preset is selected
- **THEN** the tempo choices read Fast (0.8 s per count), Normal (1 s per count), and Slow (1.25 s per count), in that order, with Fast on top although its count length is the smallest number

#### Scenario: Labels for Breath Retention
- **WHEN** Breath Retention is selected
- **THEN** the tempo choices read Fast, Normal, and Slow, in that order, with no seconds

### Requirement: Phase length tempo choices
For Box Breathing and Balanced Breathing, the Tempo control SHALL offer the phase length instead of Slow, Normal, and Fast, listed from the longest phase length to the shortest: 8, 7, 5, 4, and 3 seconds per phase for Box Breathing, defaulting to 5, and 7, 6, 5.5, 5, and 4 seconds per phase for Balanced Breathing, defaulting to 5.5.

#### Scenario: Default tempo is 5.5 s per phase
- **WHEN** the app is opened with no prior selection
- **THEN** Balanced Breathing is selected with 5.5 s per phase

#### Scenario: Phase lengths for Box Breathing
- **WHEN** Box Breathing is selected for the first time
- **THEN** the tempo choices read 8 s per phase, 7 s per phase, 5 s per phase, 4 s per phase, and 3 s per phase, in that order from top to bottom, with 5 s per phase selected, and the caption still reads Tempo

#### Scenario: Phase lengths for Balanced Breathing
- **WHEN** Balanced Breathing is selected for the first time
- **THEN** the tempo choices read 7 s per phase, 6 s per phase, 5.5 s per phase, 5 s per phase, and 4 s per phase, in that order from top to bottom, with 5.5 s per phase selected, and the caption still reads Tempo

### Requirement: Tempo scales every preset
The system SHALL apply the selected Slow, Normal, or Fast tempo to the 4-6-7 preset by multiplying each phase's count length by the tempo's second length, preserving the relative proportions of the phases within a cycle. Box Breathing and Balanced Breathing are not scaled: their tempo choice sets the phase length directly. Breath Retention applies the tempo to its breathing only, as defined by the breath-retention capability.

#### Scenario: Fast tempo shortens 4-6-7
- **WHEN** the user starts the 4-6-7 preset at Fast tempo
- **THEN** the inhale lasts 3.2 real seconds, the hold 4.8, and the exhale 5.6

#### Scenario: Slow tempo lengthens 4-6-7
- **WHEN** the user starts the 4-6-7 preset at Slow tempo
- **THEN** the inhale lasts 5 real seconds, the hold 7.5, and the exhale 8.75

#### Scenario: Tempo applies to Box Breathing too
- **WHEN** the user starts Box Breathing with a tempo choice of 7 s per phase
- **THEN** that choice sets each phase to 7 real seconds of 7 counts, rather than scaling a fixed count length

#### Scenario: Tempo applies to Balanced Breathing too
- **WHEN** the user starts Balanced Breathing with a tempo choice of 6 s per phase
- **THEN** that choice sets the inhale and the exhale to 6 real seconds each, rather than scaling a fixed count length

#### Scenario: Proportions are preserved
- **WHEN** 4-6-7 runs at any tempo
- **THEN** the ratio between its phase durations is the same as at Normal tempo

### Requirement: Selected tempo applies to a new session
The system SHALL use the selected tempo when a session starts and SHALL keep the active tempo unchanged while the session is running or paused. Each pattern SHALL remember its own tempo choice while the page is open, so selecting a pattern again restores the tempo last chosen for it.

#### Scenario: Start uses selected tempo
- **WHEN** the user selects a tempo while idle and starts a session
- **THEN** the session runs with that tempo's count length, or for Box Breathing and Balanced Breathing with that phase length

#### Scenario: Tempo cannot alter an active session
- **WHEN** a session is running or paused
- **THEN** the tempo control is unavailable and the active session continues at its current tempo

#### Scenario: Reset preserves tempo
- **WHEN** the user resets a session
- **THEN** the session returns to idle and the selected tempo remains selected for the next start

#### Scenario: Each pattern remembers its tempo
- **WHEN** the user selects Fast for 4-6-7, switches to Box Breathing and selects 7 s per phase, then switches back to 4-6-7
- **THEN** Fast is selected, and switching to Box Breathing again selects 7 s per phase

### Requirement: Pattern stepping buttons
The pattern control SHALL show a round previous button inside its left edge and a round next button inside its right edge. They SHALL select the previous or next pattern without opening the list, wrapping around at both ends, and SHALL be unavailable while a session is running or paused. The tempo control SHALL NOT have stepping buttons.

#### Scenario: Next pattern
- **WHEN** Balanced Breathing is selected and the user presses the next button
- **THEN** Box Breathing is selected, as if chosen from the list

#### Scenario: Previous pattern
- **WHEN** Breath Retention is selected and the user presses the previous button
- **THEN** 4-6-7 Breathing is selected

#### Scenario: Wrapping around
- **WHEN** Breath Retention is selected and the user presses the next button, or Balanced Breathing is selected and the user presses the previous button
- **THEN** Balanced Breathing or Breath Retention is selected, respectively

#### Scenario: Unavailable during a session
- **WHEN** a session is running or paused
- **THEN** both buttons are unavailable and pressing them does not change the pattern

#### Scenario: Buttons have accessible names
- **WHEN** a screen reader reaches the buttons
- **THEN** they are announced as previous pattern and next pattern

#### Scenario: No stepping buttons on the tempo control
- **WHEN** the user views the tempo control
- **THEN** it has no previous or next buttons

### Requirement: Arrow-key pattern stepping
The system SHALL select the previous pattern when the user presses Left Arrow and the next pattern when the user presses Right Arrow, with the same result and wrapping as the pattern stepping buttons. The keys SHALL step patterns only while the stepping buttons are available, and SHALL be ignored while a modifier key (Alt, Ctrl, Meta, or Shift) is held or while focus is in a form field.

#### Scenario: Right Arrow selects the next pattern
- **WHEN** Balanced Breathing is selected, the session is idle, and the user presses Right Arrow
- **THEN** Box Breathing is selected, as if the next button had been pressed

#### Scenario: Left Arrow selects the previous pattern and wraps
- **WHEN** Balanced Breathing is selected, the session is idle, and the user presses Left Arrow
- **THEN** Breath Retention is selected

#### Scenario: Unavailable during a session
- **WHEN** a session is running or paused and the user presses Left Arrow or Right Arrow
- **THEN** the pattern does not change

#### Scenario: Available again after reset
- **WHEN** the user resets a session and then presses Right Arrow
- **THEN** the next pattern is selected

#### Scenario: Modifier keys are left alone
- **WHEN** the user presses Left Arrow or Right Arrow while holding Alt, Ctrl, Meta, or Shift
- **THEN** the pattern does not change and the browser's own shortcut (e.g. history navigation) is not blocked

#### Scenario: Form fields keep their own arrow keys
- **WHEN** focus is in the pattern, tempo, or breaths list and the user presses Left Arrow or Right Arrow
- **THEN** the shortcut does not step the pattern; the list handles the key natively

#### Scenario: Up and Down arrows are not shortcuts
- **WHEN** the user presses Up Arrow or Down Arrow outside a form field
- **THEN** the pattern does not change; Up and Down Arrow are not pattern shortcuts (see Arrow-key tempo stepping)

### Requirement: Arrow-key tempo stepping
For every pattern except Breath Retention, the system SHALL select the tempo choice one place above the current one when the user presses Up Arrow and one place below when the user presses Down Arrow, as if chosen from the list. Stepping SHALL NOT wrap: at the top choice Up Arrow, and at the bottom choice Down Arrow, SHALL change nothing. The keys SHALL be available under the same conditions as Arrow-key pattern stepping; while available they SHALL NOT scroll the page, even at a limit.

#### Scenario: Up Arrow selects the choice above
- **WHEN** Balanced Breathing is selected at 5.5 s per phase, the session is idle, and the user presses Up Arrow
- **THEN** 6 s per phase is selected, as if chosen from the tempo list

#### Scenario: Down Arrow selects the choice below
- **WHEN** 4-6-7 Breathing is selected at Normal and the user presses Down Arrow
- **THEN** Slow is selected

#### Scenario: No wrap at the top
- **WHEN** Box Breathing is selected at 8 s per phase and the user presses Up Arrow
- **THEN** 8 s per phase stays selected and the page does not scroll

#### Scenario: No wrap at the bottom
- **WHEN** 4-6-7 Breathing is selected at Slow and the user presses Down Arrow
- **THEN** Slow stays selected and the page does not scroll

#### Scenario: Stepped tempo is remembered and bookmarked
- **WHEN** the user steps the tempo with Up or Down Arrow, switches to another pattern, and returns
- **THEN** the stepped tempo is selected again, and the URL shows it while the page is served over http(s)

#### Scenario: Unavailable during a session
- **WHEN** a session is running or paused and the user presses Up Arrow or Down Arrow
- **THEN** the tempo does not change and the page scrolls as usual

#### Scenario: Modifier keys and form fields are left alone
- **WHEN** the user presses Up Arrow or Down Arrow while holding Alt, Ctrl, Meta, or Shift, or while focus is in the pattern, tempo, or breaths list
- **THEN** the shortcut does not step the tempo and the browser or the list handles the key natively

### Requirement: Space key starts a session
While the session is idle, the system SHALL start a session when the user presses Space, as if Start had been pressed, and SHALL move focus to the Start control so the next Tab press continues from Start to the controls after it. Used this way, Space SHALL NOT scroll the page.

#### Scenario: Space starts from idle
- **WHEN** the session is idle, nothing is focused, and the user presses Space
- **THEN** a session starts with the same pattern, tempo, and sound behaviour as pressing Start, and the page does not scroll

#### Scenario: Tab reaches Reset next
- **WHEN** the user has started a session with Space and then presses Tab
- **THEN** focus moves to the Reset control (in debug mode, to Pause first, then Reset)

#### Scenario: Start already focused
- **WHEN** the Start control has focus and the user presses Space
- **THEN** exactly one session starts

### Requirement: Space key never resets
Space SHALL NOT end a session unless the Reset control itself has focus. While a session runs and focus is not on a button, Space SHALL do nothing apart from what Space key ends the hold in breath-retention defines.

#### Scenario: Space while running does not reset
- **WHEN** a Balanced Breathing session is running, nothing is focused, and the user presses Space
- **THEN** the session keeps running unchanged

#### Scenario: Space on focused Reset
- **WHEN** the Reset control has focus and the user presses Space
- **THEN** the session ends, as it would for a click on Reset

### Requirement: Space key shortcut conditions
The Space shortcuts SHALL be ignored while a modifier key (Alt, Ctrl, Meta, or Shift) is held, while focus is in a form field, and for repeated key events from a held key. While focus is on a button, Space SHALL keep its native meaning of pressing that button.

#### Scenario: Modifier keys are left alone
- **WHEN** the session is idle and the user presses Shift+Space
- **THEN** no session starts

#### Scenario: Form fields keep Space
- **WHEN** focus is in the pattern, tempo, or breaths list and the user presses Space
- **THEN** no session starts; the list handles the key natively

#### Scenario: Focused button keeps Space
- **WHEN** the session is idle, the sound switch has focus, and the user presses Space
- **THEN** the sound switch toggles and no session starts

#### Scenario: Held key does not repeat
- **WHEN** the user starts a session with Space and keeps holding it
- **THEN** only the first key press acts

### Requirement: Stable pattern control width
The pattern control SHALL keep the same width for every pattern, wide enough for the longest pattern name, so the stepping buttons stay in place while the user steps through the patterns.

#### Scenario: Buttons stay in place
- **WHEN** the user steps through every pattern
- **THEN** the pattern control and both buttons keep the same size and position

#### Scenario: Every name fits
- **WHEN** any pattern is selected
- **THEN** its full name is shown between the two buttons without being cut off

### Requirement: Session control state machine
The system SHALL provide start, pause, resume, and reset controls, with pause and resume available only in debug mode. Sessions SHALL start from idle, pause and resume keep the current phase position and elapsed time within it, and reset returns the session to idle.

#### Scenario: Start from idle
- **WHEN** the user presses start from idle
- **THEN** the session begins with the inhale phase at zero elapsed time

#### Scenario: Pause and resume preserves position
- **WHEN** debug mode is on and the user pauses mid-phase and then resumes
- **THEN** the session continues in the same phase from the elapsed time it had when paused, and preview state remains visible while paused

#### Scenario: Reset
- **WHEN** the user resets from running or paused
- **THEN** the session returns to idle with no active phase

### Requirement: Continuous session signal
The system SHALL expose a continuously updated signal while running containing the current phase, elapsed time within the phase, and a lung-fill level that increases during inhale, stays at maximum during full-lung hold, decreases during exhale, and would stay at minimum during an empty-lung hold. The signal SHALL be derived from a wall-clock source and remain monotonic within a phase.

#### Scenario: Lung fill follows phase
- **WHEN** the engine updates during inhale, full hold, and exhale
- **THEN** the lung-fill level rises toward maximum during inhale, stays at maximum during full hold, and falls toward minimum during exhale

#### Scenario: Pause freezes the signal
- **WHEN** the session is paused
- **THEN** the lung-fill level and phase progress stop changing until resumed

### Requirement: Subtle eased breathing pulse of every circle layer
The system SHALL continuously animate the radius of the filling circle with the lung-fill level, and the unfilled outline and decorative backdrop SHALL follow the same radius, so all circle layers grow while breathing in, shrink while breathing out, and stay constant during holds, accelerating at the start and decelerating at the end of each change. The Breath Retention hold is the one exception: it pulses slowly as defined by the breath-retention capability.

#### Scenario: Ring pulses with breathing
- **WHEN** a session runs through inhale, hold, and exhale
- **THEN** the filling circle's radius grows during inhale, does not change during hold, and shrinks during exhale

#### Scenario: All layers follow the breathing radius
- **WHEN** the filling circle's radius changes with the lung fill
- **THEN** the unfilled outline and the decorative backdrop use the same radius

#### Scenario: Smooth animation
- **WHEN** a session is running on a device capable of 60 fps
- **THEN** the circle layers update on rendered frames rather than once per second

#### Scenario: Eased motion
- **WHEN** the filling circle grows during an inhale
- **THEN** its growth rate is small at the very start of the inhale and near the end, and largest in the middle

#### Scenario: Single breathing circle
- **WHEN** the app renders any display state
- **THEN** there is a single breathing circle geometry (the filling ring with its layers), not an additional inner circle

### Requirement: Breathing amplitude and viewport fit
The system SHALL let the filling circle's radius differ between empty-lung and full-lung states by at least 8 units on the square SVG view scale, and no circle layer SHALL extend beyond the SVG viewport at any lung state.

#### Scenario: Amplitude at least 8 units
- **WHEN** the filling circle is compared between the empty-lung and full-lung states
- **THEN** its radius differs by at least 8 units on the square SVG view scale

#### Scenario: No clipping
- **WHEN** the filling circle is at its full-lung radius
- **THEN** every circle layer, including the much thicker backdrop, remains inside the SVG viewport

### Requirement: Phase progress ring
The system SHALL render a progress ring that fills linearly with elapsed phase time along a circle outline, starting at 12 o'clock and moving clockwise, resetting at each phase start, so the unfilled portion reads as the remaining phase time. Breath Retention's breathing part and hold instead show a fully drawn ring.

#### Scenario: Ring fills proportionally to phase progress
- **WHEN** a phase is halfway through its duration
- **THEN** approximately half of the ring is filled

#### Scenario: Ring fills during hold
- **WHEN** a 6-second hold is 2 seconds in
- **THEN** the ring shows roughly 2/6 filled and the remainder as unfilled

#### Scenario: Ring resets each phase
- **WHEN** a phase ends and the next begins
- **THEN** the filled portion returns to zero and starts filling again

#### Scenario: Ring starts at the top
- **WHEN** a phase starts
- **THEN** the filled arc begins at the 12 o'clock position, consistent with the progress dot's start

### Requirement: Phase progress ring appearance
The progress ring SHALL be much thinner than the progress dot and SHALL use the phase color. Its unfilled outline SHALL match the filled arc in thickness and radial position while using a dark phase shade slightly lighter than the decorative backdrop's.

#### Scenario: Unfilled outline color
- **WHEN** a phase is partially complete
- **THEN** the not-yet-filled portion matches the filled arc in thickness and radial position and uses a dimmed shade of the current phase color

### Requirement: Decorative dark backdrop ring
The system SHALL render, purely as an aesthetic background, a complete outline behind the filling circle that is much darker and much thicker than the ring, thicker than any other ring layer, colored with a much darker variant of the phase color and carrying no timing information.

#### Scenario: Dark backdrop behind the ring
- **WHEN** the app renders any display state
- **THEN** a complete, much darker, much thicker outline lies behind the filling circle and shows no timing information

### Requirement: Progress dot marks the fill position
The system SHALL mark the current end of the filled ring portion with a dot that is visibly larger than the ring stroke, positioned on the ring at the boundary between filled and unfilled portions, starting at the top (12 o'clock). The dot SHALL move continuously with phase progress and SHALL use the phase color. No dot is shown where the ring is fully drawn without progress (Breath Retention's breathing part and hold).

#### Scenario: Dot at the fill position
- **WHEN** a phase is underway
- **THEN** the dot sits on the ring exactly where the filled and unfilled arcs meet

#### Scenario: Dot travels with progress
- **WHEN** the phase progresses further
- **THEN** the dot moves continuously along the ring

#### Scenario: Dot larger than the ring stroke
- **WHEN** the dot is visible
- **THEN** its diameter is greater than the ring stroke width

### Requirement: Phase coloring
The system SHALL color the display by phase and active palette. In day mode: red during inhale, blue during exhale. In night mode: deep red during inhale, amber during exhale. In both palettes a hold with lungs full is light gray and a hold with lungs empty is gray (lighter than the empty hold's gray). The color SHALL remain unchanged during hold. Breath Retention's breathing part and hold use their own colors, defined by the breath-retention capability.

#### Scenario: Colors across the cycle
- **WHEN** a 4-6-7 session runs an inhale → hold → exhale cycle in day mode
- **THEN** the display is red during inhale, becomes light gray during the 6-count full hold, and blue during exhale

#### Scenario: Night mode colors across the cycle
- **WHEN** a 4-6-7 session runs an inhale → hold → exhale cycle in night mode
- **THEN** the display is deep red during inhale, a dim gray during the full hold, and amber during exhale

### Requirement: Settled layer shades
Once the color transition settles, the system SHALL apply three shades of the current phase color: the filled arc and dot use the bright shade, the decorative backdrop uses a much darker shade, and the unfilled outline uses a dimmed shade slightly brighter than the backdrop's.

#### Scenario: Settled shades per layer
- **WHEN** a phase's color fade has completed
- **THEN** the filled arc and dot are bright, the backdrop much darker, and the unfilled outline dimmed, slightly brighter than the backdrop

### Requirement: Color fades on start and phase change
The system SHALL fade the decorative backdrop and the unfilled outline into their new colors whenever the session starts from the ready state and on every phase change, transitioning smoothly rather than switching instantly. Resetting to the ready state SHALL fade both layers back to their neutral grays.

#### Scenario: Fade from the ready state
- **WHEN** the timer starts from the ready state
- **THEN** the backdrop fades from its neutral dark gray to the inhale phase's dark shade, and the unfilled outline fades from the ready gray directly to the dimmed inhale color

#### Scenario: Backdrop fades on phase change
- **WHEN** a phase changes
- **THEN** the backdrop fades to the much darker shade of the new phase's color

#### Scenario: Unfilled fades straight to the new color
- **WHEN** a phase changes
- **THEN** the unfilled outline fades directly to the dimmed current-phase color with no intermediate color

#### Scenario: Reset fades back to neutral
- **WHEN** the user resets a running or paused session
- **THEN** the backdrop and the unfilled outline fade back to their neutral grays

#### Scenario: Arc and dot switch instantly
- **WHEN** a phase changes
- **THEN** the filled arc and the dot take the new bright color immediately with no transition

### Requirement: Night mode palette
In night mode the system SHALL render the display without any blue hue, using a deep red for inhale and amber for exhale, and SHALL dim the background, text, and every circle layer relative to day mode. The one exception is the turquoise ring of the Breath Retention hold.

#### Scenario: No blue in night mode
- **WHEN** night mode is active and a session runs through a full cycle of a cyclic preset
- **THEN** no layer of the display uses a blue hue at any point in the cycle

#### Scenario: Night mode phase hues
- **WHEN** night mode is active
- **THEN** the inhale phase is deep red and the exhale phase is amber

#### Scenario: Night mode is dimmer
- **WHEN** night mode is active
- **THEN** the background, text, and circle layers are dimmer than their day mode counterparts

#### Scenario: Turquoise hold in night mode
- **WHEN** night mode is active during a Breath Retention hold
- **THEN** the hold ring is turquoise

### Requirement: Night mode preserves layer structure and fades
Night mode SHALL keep the existing three-shade layer structure and colour-fade behavior, substituting only the hues and brightness.

#### Scenario: Three shades still apply
- **WHEN** a phase's colour fade has completed in night mode
- **THEN** the filled arc and dot are the bright night shade, the backdrop much darker, and the unfilled outline dimmed and slightly brighter than the backdrop

#### Scenario: Fades still occur
- **WHEN** a phase changes in night mode
- **THEN** the backdrop and unfilled outline fade into the new phase's night shades rather than switching instantly

### Requirement: Night mode activation
The system SHALL activate night mode from the operating system's dark colour-scheme preference by default, and SHALL provide a manual override the user can apply at any session state, including while running or paused. The override SHALL NOT be stored by the app; it SHALL apply after a reload only when the loaded URL carries it, as defined by the url-settings capability.

#### Scenario: Follows the system preference
- **WHEN** the app is opened with no manual override and the operating system prefers a dark colour scheme
- **THEN** night mode is active

#### Scenario: Follows the system preference when light
- **WHEN** the app is opened with no manual override and the operating system does not prefer a dark colour scheme
- **THEN** day mode is active

#### Scenario: Manual override wins
- **WHEN** the user applies the manual override
- **THEN** the chosen mode is used regardless of the operating system preference

#### Scenario: Override during a session
- **WHEN** the user toggles the mode while a session is running or paused
- **THEN** the palette changes and the session continues uninterrupted at its current phase and elapsed time

#### Scenario: Override is forgotten on reload
- **WHEN** the user applies the manual override and then reloads the app from a URL that carries no `theme` parameter, such as a local file
- **THEN** the mode follows the operating system preference again

### Requirement: Session controls and labels are always visible
The system SHALL show which action is available for the current session state: start when idle, reset when running, and, in debug mode only, pause when running and resume and reset when paused. Breath Retention additionally shows its Breathe in control during the hold.

#### Scenario: Control visibility
- **WHEN** debug mode is off and the session state is idle or running
- **THEN** the visible controls are (idle): start, (running): reset

#### Scenario: Control visibility in debug mode
- **WHEN** debug mode is on and the session state is idle, running, or paused
- **THEN** the visible controls are (idle): start, (running): pause + reset, (paused): resume + reset

### Requirement: Session indicator content
The system SHALL identify the current phase (inhale, hold, exhale) while the session is running or paused. The system SHALL show the seconds remaining in the phase only for phases whose real duration, after the tempo is applied, is at least 10 seconds; shorter phases SHALL show no seconds, leaving the remaining time to the progress ring. Breath Retention shows the breath number in its breathing part and the time counting up in its hold instead.

#### Scenario: Phase label
- **WHEN** the session is 2 seconds into a 6-count hold
- **THEN** the display shows the hold phase

#### Scenario: Seconds hidden for short phases
- **WHEN** the current phase's real duration is less than 10 seconds (all phases of the 4-6-7 preset at every tempo, and all Box Breathing and Balanced Breathing phase lengths)
- **THEN** no seconds remaining is shown for that phase

#### Scenario: Seconds shown for long phases
- **WHEN** a phase whose real duration is 15 seconds is 5 seconds in
- **THEN** the display shows 10 seconds remaining

#### Scenario: Threshold uses real duration, not counts
- **WHEN** a phase of 8 counts runs at Slow tempo, giving 10 real seconds
- **THEN** seconds remaining are shown, because the real duration reaches 10 seconds although the phase has fewer than 10 counts

### Requirement: Completed cycle count display
The system SHALL display the number of completed cycles inside the circle during running and paused sessions, beginning at zero and increasing when each full cycle completes. For Breath Retention it SHALL display the number of completed rounds instead.

#### Scenario: New session starts with zero completed cycles
- **WHEN** a session starts
- **THEN** the completed cycle count is zero

#### Scenario: Completed cycle count increments
- **WHEN** the final phase of a cycle completes
- **THEN** the displayed completed cycle count increases by one

#### Scenario: Completed cycle count is frozen while paused
- **WHEN** a session is paused
- **THEN** the displayed completed cycle count remains unchanged until the session resumes

#### Scenario: Breath Retention counts rounds
- **WHEN** a Breath Retention session has completed two rounds
- **THEN** the display shows 2 completed rounds

### Requirement: Active session time display
The system SHALL display elapsed active session time in real minutes and seconds during running and paused sessions, excluding time spent paused and independent of the selected tempo. The time SHALL include the current, unfinished cycle or round.

#### Scenario: Active time starts at zero
- **WHEN** a session starts
- **THEN** the displayed active session time is `00:00`

#### Scenario: Active time advances while running
- **WHEN** a session runs for additional time
- **THEN** the displayed active session time advances in `mm:ss` format

#### Scenario: Active time freezes while paused
- **WHEN** a session is paused
- **THEN** the displayed active session time remains unchanged until the session resumes

#### Scenario: Active time ignores tempo
- **WHEN** a session runs for 60 real seconds at Slow or Fast tempo
- **THEN** the displayed active session time is `01:00`

#### Scenario: Reset clears session metrics
- **WHEN** the user resets a running or paused session and then starts a new session
- **THEN** the cycle count and active session time start again from zero

#### Scenario: Partial cycle counts toward time
- **WHEN** the user presses Done 3 seconds into the fourth cycle of a 4-6-7 session at Normal tempo
- **THEN** the active session time is `00:54`

### Requirement: Runs as a single self-contained HTML file
The system's production build SHALL produce one `index.html` file containing all JavaScript and CSS inline, loadable from a local file path with no network requests, no runtime external dependencies, and no backend or storage required for a session. Session sounds SHALL be generated in the page, with no audio files.

#### Scenario: Offline single-file use
- **WHEN** the built `index.html` is opened from a local file path while offline
- **THEN** a complete 4-6-7 session can be run with start and done and the full visual behavior

#### Scenario: Offline sound
- **WHEN** the built `index.html` is opened from a local file path while offline and sound is turned on
- **THEN** phase-change and tick sounds play without loading any file or network resource

### Requirement: Responsive layout
The system SHALL present the animated shape and controls so they remain visible and usable at both desktop and mobile phone viewport sizes, scaling the animated shape with the viewport. The page SHALL be no taller than the visible viewport when its content fits, so it cannot be scrolled vertically, and SHALL stay scrollable when its content does not fit. Swiping past the top or bottom edge of the page SHALL NOT pull the page away from the edge.

#### Scenario: Mobile viewport
- **WHEN** the app is viewed in a portrait phone-sized viewport
- **THEN** the animated shape and the session controls are fully visible without horizontal scrolling

#### Scenario: Nothing to scroll in a phone browser tab
- **WHEN** the app is viewed in a phone browser tab, with the browser toolbars shown or hidden, and all content fits the visible viewport
- **THEN** the page cannot be scrolled vertically and the circle and controls stay in place when the user swipes up or down

#### Scenario: Nothing to scroll in the home-screen web app
- **WHEN** the app is opened from the iPhone home screen as a web app and all content fits the screen
- **THEN** the page cannot be scrolled vertically, and the controls keep the bottom spacing of the home-screen web app

#### Scenario: Phone in landscape
- **WHEN** the app is viewed on a phone in landscape
- **THEN** the page cannot be scrolled vertically, and every control is on screen and can be used

#### Scenario: Content taller than the viewport
- **WHEN** the content does not fit the visible viewport, for example when the window is too short for the session controls
- **THEN** the page can be scrolled vertically so every control can be reached

#### Scenario: No bounce at the page edges
- **WHEN** the user swipes down at the top of the page or up at the bottom, on a phone in a browser tab or as a home-screen web app
- **THEN** the page does not bounce or pull away from the edge, and pull-to-refresh does not trigger

### Requirement: Bottom spacing in the home-screen web app
When the app runs as an iOS home-screen web app without browser toolbars, the system SHALL leave 2.3rem of extra space below the session controls, on top of the normal bottom spacing. That is close to the Start button's height. In a regular browser tab, the spacing below the controls SHALL stay as it is.

#### Scenario: Opened from the iPhone home screen
- **WHEN** the app is opened from the iPhone home screen as a web app
- **THEN** the session controls sit 2.3rem higher above the bottom edge than in Safari, and can be tapped without reaching into the home indicator area

#### Scenario: Regular browser tab
- **WHEN** the app is opened in a regular browser tab on a phone or desktop
- **THEN** the spacing below the session controls is the same as before this change

### Requirement: Count tick marks on the ring
For presets with ticks enabled, the system SHALL draw tick marks on the breathing ring during running and paused sessions, one per count of the current phase, evenly spaced from 12 o'clock clockwise so the ring is split into as many equal arcs as the phase has counts, at every tempo. The marks SHALL follow the breathing radius, SHALL be tinted in the current ring color, and SHALL NOT be shown while idle.

#### Scenario: Tick count follows the phase
- **WHEN** a 4-6-7 session runs through inhale, hold, and exhale
- **THEN** the ring shows 4 tick marks during the inhale, 6 during the hold, and 7 during the exhale

#### Scenario: Ticks follow counts, not real seconds
- **WHEN** 4-6-7 runs at Slow or Fast tempo
- **THEN** the ring still shows 4, 6, and 7 evenly spaced tick marks for its phases

#### Scenario: Box Breathing ticks follow the phase length
- **WHEN** Box Breathing runs at 8 s per phase
- **THEN** each phase shows 8 evenly spaced tick marks

#### Scenario: Ticks reach the dot at each count
- **WHEN** a phase has been running for a whole number of counts at the selected tempo
- **THEN** the progress dot is on a tick mark

#### Scenario: Ticks breathe with the ring
- **WHEN** the breathing radius changes with the lung fill
- **THEN** the tick marks stay on the ring at the same radius

#### Scenario: Ticks are tinted in the ring color
- **WHEN** a phase is running
- **THEN** the tick marks are tinted in that phase's ring color and change color with the phase

#### Scenario: No ticks while idle
- **WHEN** the session is idle
- **THEN** no tick marks are shown

### Requirement: Balanced Breathing tick spacing
A Balanced Breathing phase SHALL have one count per whole second of its length, each count lasting the phase length divided by that number, so its tick marks always split the ring into equal arcs.

#### Scenario: Balanced Breathing ticks at whole-second lengths
- **WHEN** Balanced Breathing runs at 6 s per phase
- **THEN** the inhale and the exhale each show 6 evenly spaced tick marks, one second apart

#### Scenario: Balanced Breathing ticks at 5.5 s per phase
- **WHEN** Balanced Breathing runs at 5.5 s per phase
- **THEN** the inhale and the exhale each show 5 evenly spaced tick marks, 1.1 seconds apart, splitting the ring into 5 equal arcs

### Requirement: Tick flash inside a phase
For presets with ticks enabled, the system SHALL briefly flash the filled arc when the progress dot passes a tick mark inside a phase. The tick at a phase start SHALL NOT flash. Each tick SHALL flash at most once, and no flash SHALL occur while paused.

#### Scenario: Flash on an in-phase tick
- **WHEN** the dot passes the second tick mark of a 4-count inhale
- **THEN** the filled arc flashes briefly and then returns to its normal shade

#### Scenario: No flash at phase start
- **WHEN** a new phase begins
- **THEN** the filled arc does not flash

#### Scenario: Resume does not repeat a flash
- **WHEN** the session is paused just after a tick flashed and is then resumed
- **THEN** that tick does not flash again

#### Scenario: Skipped frames flash at most once
- **WHEN** the page was hidden and returns with several ticks passed since the last rendered frame
- **THEN** at most one flash occurs

### Requirement: Per-preset ticks setting
Each preset SHALL define whether it uses ticks. With ticks disabled, the system SHALL show no tick marks, no tick flash, and play no in-phase tick sound for that preset; phase-change sounds are not affected. The 4-6-7 preset, Box Breathing at every phase length, and Balanced Breathing at every phase length SHALL have ticks enabled.

#### Scenario: Current presets use ticks
- **WHEN** a 4-6-7, Box Breathing, or Balanced Breathing session runs
- **THEN** tick marks are shown and in-phase ticks flash

#### Scenario: Preset without ticks
- **WHEN** a session runs with a preset that has ticks disabled
- **THEN** no tick marks or tick flashes are shown and no in-phase tick sound plays, while phase-change sounds still play when sound is on

### Requirement: Phase-change sound
When sound is on, the system SHALL play a phase-change tone at the start of every phase, including the first inhale of a session, with a distinct pitch for inhale, hold, and exhale phases, distinguishable from the in-phase tick sound. The breathing part of Breath Retention is the exception and uses its own breath sound.

#### Scenario: Tone at each phase start
- **WHEN** sound is on and a 4-6-7 session runs through a cycle
- **THEN** a phase-change tone plays as the inhale, the hold, and the exhale begin

#### Scenario: Tone on session start
- **WHEN** sound is on and the user starts a 4-6-7 or Box Breathing session
- **THEN** the inhale phase-change tone plays at the start

#### Scenario: Pitch identifies the phase
- **WHEN** phase-change tones play for an inhale, a hold, and an exhale
- **THEN** the three tones have distinct pitches

### Requirement: In-phase tick sound
When sound is on and the preset has ticks enabled, the system SHALL play a soft tick sound at each tick inside a phase, at the moment the progress dot reaches that tick, and SHALL play no tick sound at a phase start, where the phase-change tone plays instead.

#### Scenario: Tick sounds during a phase
- **WHEN** sound is on and a 4-count inhale runs
- **THEN** a tick sound plays at counts 1, 2, and 3, and the phase-change tone plays at count 0

#### Scenario: Ticks are counted at the tempo
- **WHEN** sound is on and a session runs at Slow tempo
- **THEN** tick sounds are 1.25 real seconds apart

#### Scenario: Ticks follow the marks at 5.5 s per phase
- **WHEN** sound is on and Balanced Breathing runs at 5.5 s per phase
- **THEN** tick sounds play 1.1, 2.2, 3.3, and 4.4 seconds into each phase, and the phase-change tone plays at its start

### Requirement: Sound continues in the background
The system SHALL keep playing session sounds on time while the page is hidden or in a background tab, and SHALL stop every pending sound immediately when the session is paused or reset. On mobile devices the system SHALL keep playing sounds while the screen is locked wherever the platform allows web audio to continue.

#### Scenario: Background tab
- **WHEN** sound is on and the user switches to another tab during a running session for several minutes
- **THEN** phase-change and tick sounds keep playing at their scheduled times

#### Scenario: Pause silences pending sounds
- **WHEN** the user pauses a running session with sound on
- **THEN** no further session sounds play until the session resumes

#### Scenario: Resume continues on time
- **WHEN** the user resumes a paused session with sound on
- **THEN** the next sounds play when the dot reaches their positions, measured from the resumed position

#### Scenario: Reset silences pending sounds
- **WHEN** the user resets a running or paused session with sound on
- **THEN** no further session sounds play

### Requirement: Sound switch
The system SHALL provide a sound on/off switch, on by default, that the user can change in any session state, including while running or paused, without affecting the session. The setting SHALL NOT be stored by the app; it SHALL apply after a reload only when the loaded URL carries it, as defined by the url-settings capability.

#### Scenario: Sound is on by default
- **WHEN** the app is opened with no `sound` parameter and the user starts a session without touching the sound switch
- **THEN** sound is on and session sounds play from the start of the session

#### Scenario: Turn on during a session
- **WHEN** the user turns sound on while a session is running
- **THEN** sounds begin with the next tick or phase change, and the session continues at its current phase and elapsed time

#### Scenario: Turn off during a session
- **WHEN** the user turns sound off while a session is running
- **THEN** no further session sounds play, and the session continues uninterrupted

#### Scenario: Setting is forgotten on reload
- **WHEN** the user turns sound off and then reloads the app from a URL that carries no `sound` parameter, such as a local file
- **THEN** sound is on

### Requirement: Audio is held only while session sounds are due
The system SHALL hold the device's audio only while a session is running with sound on, so that audio from other apps is not interrupted at any other time. It SHALL release audio as soon as the session is reset or paused or sound is turned off, and SHALL NOT take audio again until a running session with sound on needs it. A debug sound button MAY hold audio for as long as its sound plays.

#### Scenario: Opening the app
- **WHEN** the user opens the app while another app plays audio and does not start a session
- **THEN** the other audio keeps playing

#### Scenario: Other audio started after a reset
- **WHEN** the user runs a session with sound on, resets it, and then starts audio in another app
- **THEN** the other audio keeps playing

#### Scenario: Returning to the app while idle
- **WHEN** another app plays audio and the user returns to the app with no session running
- **THEN** the other audio keeps playing

#### Scenario: Pausing releases audio
- **WHEN** the user pauses a session that is running with sound on and then starts audio in another app
- **THEN** the other audio keeps playing

#### Scenario: Turning sound on while idle
- **WHEN** another app plays audio and the user turns sound on with no session running
- **THEN** the other audio keeps playing, and session sounds play once the user starts a session

#### Scenario: Turning sound off during a session
- **WHEN** the user turns sound off while a session is running and then starts audio in another app
- **THEN** the other audio keeps playing, and the session continues uninterrupted

#### Scenario: Sounds return after a release
- **WHEN** audio was released and the user starts or resumes a session with sound on, or turns sound on during a running session
- **THEN** session sounds play on time from that point

#### Scenario: Session with sound off
- **WHEN** another app plays audio and the user runs a session with sound off
- **THEN** the other audio keeps playing

### Requirement: Debug mode
The system SHALL have a debug mode that is turned on or off only by a setting in the source code, off in the shipped build. Pause and resume controls SHALL be available only in debug mode. No user action SHALL turn debug mode on.

#### Scenario: Pause hidden in normal use
- **WHEN** debug mode is off and a session is running
- **THEN** no pause or resume control is shown

#### Scenario: Pause available in debug mode
- **WHEN** debug mode is on and a session is running
- **THEN** the pause control is shown

### Requirement: Done label
The reset control SHALL be labeled Done once the current session has at least one completed cycle (or completed round for Breath Retention), and Reset before that. Done and Reset SHALL behave the same.

#### Scenario: Reset before the first cycle
- **WHEN** a 4-6-7 session is in its first cycle
- **THEN** the reset control is labeled Reset

#### Scenario: Done after a completed cycle
- **WHEN** a 4-6-7 session has completed one cycle
- **THEN** the reset control is labeled Done

#### Scenario: Done after a completed round
- **WHEN** a Breath Retention session has completed one round
- **THEN** the reset control is labeled Done

### Requirement: Session summary after the session ends
When the user ends a session with Reset or Done, the circle SHALL return to idle, and the completed cycle count (or round count) and active session time SHALL move from inside the circle to below it, frozen at their values when the session ended, above any finished rounds list. In short, wide viewports with no free space below the circle, they SHALL be shown beside it instead. Starting a new session SHALL clear them. Showing or clearing the summary SHALL NOT change the circle's position or size, and the summary SHALL NOT cover the circle.

#### Scenario: Stats move below the circle
- **WHEN** the user presses Done after 3 completed cycles and 1:05 of active time
- **THEN** the circle shows the idle state and the stats line `Cycles: 3 · Time: 01:05` is shown below the circle

#### Scenario: Summary cleared on start
- **WHEN** the user starts a new session after a summary is shown
- **THEN** the summary below the circle is cleared and the stats start again inside the circle at zero

#### Scenario: Circle stays in place when the summary appears
- **WHEN** the user presses Done or Reset
- **THEN** the circle keeps its position and size while the summary appears

#### Scenario: Circle stays in place when the summary clears
- **WHEN** the user starts a new session after a summary is shown
- **THEN** the circle keeps its position and size while the summary clears

#### Scenario: Short, wide viewport
- **WHEN** the user ends a session on a phone in landscape
- **THEN** the summary is shown beside the circle, without covering it and without the page becoming scrollable
