---
name: Obsidian Coral
colors:
  surface: '#1b110f'
  surface-dim: '#1b110f'
  surface-bright: '#433634'
  surface-container-lowest: '#150c0a'
  surface-container-low: '#241917'
  surface-container: '#281d1b'
  surface-container-high: '#332725'
  surface-container-highest: '#3f322f'
  on-surface: '#f3deda'
  on-surface-variant: '#dec0ba'
  inverse-surface: '#f3deda'
  inverse-on-surface: '#3a2d2b'
  outline: '#a58b85'
  outline-variant: '#57423e'
  surface-tint: '#ffb4a5'
  primary: '#ffb4a5'
  on-primary: '#640c01'
  primary-container: '#ff7f66'
  on-primary-container: '#731808'
  inverse-primary: '#a43c28'
  secondary: '#c6c6c9'
  on-secondary: '#2f3133'
  secondary-container: '#454749'
  on-secondary-container: '#b4b5b7'
  tertiary: '#4adcc3'
  on-tertiary: '#00382f'
  tertiary-container: '#00b9a1'
  on-tertiary-container: '#004339'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a5'
  on-primary-fixed: '#3f0400'
  on-primary-fixed-variant: '#842413'
  secondary-fixed: '#e2e2e5'
  secondary-fixed-dim: '#c6c6c9'
  on-secondary-fixed: '#1a1c1e'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#6cf9df'
  tertiary-fixed-dim: '#4adcc3'
  on-tertiary-fixed: '#00201b'
  on-tertiary-fixed-variant: '#005045'
  background: '#1b110f'
  on-background: '#f3deda'
  surface-variant: '#3f322f'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 2rem
  gutter: 1.5rem
  sidebar-width: 260px
  stack-gap: 0.75rem
  section-gap: 3rem
---

## Brand & Style

The brand personality is "Visually Silent." It is designed for high-performance individuals who require a workspace that recedes into the background, allowing their work to take center stage. The aesthetic is heavily inspired by premium desktop operating systems—emphasizing precision, intentionality, and a "Pro" utility feel.

The design style is a sophisticated blend of **Minimalism** and **Modern Corporate**, utilizing wide margins and a strict hierarchy to create a sense of calm. Visual depth is achieved through subtle tonal layering rather than aggressive shadows, maintaining a flat but tactile interface that feels rooted in the hardware it runs on.

## Colors

The palette is anchored in a monochromatic "Deep Charcoal" spectrum to minimize eye strain during long sessions. 

- **Primary Background**: A deep, neutral charcoal that provides a void-like canvas.
- **Surface**: Used for containers and sidebars to create a subtle 1-step lift from the background.
- **Accent (Coral)**: Reserved exclusively for moments of high importance—active timers, primary action buttons, and critical progress indicators. It should never be used for decorative elements.
- **Typography**: Uses off-white for primary readability to avoid the harsh contrast of pure white, while secondary text is muted to reduce visual noise.

## Typography

This design system uses **Inter** for its modern, neutral, and highly legible characteristics. The type scale is tight and functional.

- **Display & Headlines**: High weight with tight letter-spacing for a confident, editorial feel. 
- **Body**: Set at 15px/17px to mimic standard macOS/Windows system sizes, ensuring familiarity.
- **Labels**: Small caps are used for metadata or category headers to provide distinction without increasing font size.
- **Scaling**: For mobile views, Display and Headline-LG sizes should be reduced by 20% to maintain container balance.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. The sidebar is fixed at 260px, while the main content area is a fluid grid with a maximum content width of 1200px to prevent lines of text from becoming too long.

- **Breathing Room**: Generous `section-gap` values are used to separate functional blocks (e.g., Timer vs. Task List).
- **Rhythm**: All spacing is based on an 8px base unit. 
- **Desktop**: 12-column grid with 24px gutters.
- **Tablet**: 8-column grid with 16px gutters.
- **Mobile**: 4-column grid with 16px margins; sidebar collapses into a bottom navigation bar or a "hamburger" drawer.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Subtle Outlines** rather than traditional shadows.

- **Level 0 (Background)**: `#1A1C1E`.
- **Level 1 (Sidebar/Cards)**: `#252729`.
- **Level 2 (Popovers/Modals)**: `#2C2E30` with a very soft, 20% opacity black shadow (0px 4px 20px).
- **Borders**: All surface elements feature a 1px solid border at 5% white opacity to define edges against the dark background. This creates a "glass-like" feel without the blur intensity.

## Shapes

The shape language is "Soft-Pro." It avoids the aggressive playfulness of fully circular pill shapes for structural elements, preferring large, consistent radii that feel architectural.

- **Standard Elements**: 0.5rem (8px) for inputs and small cards.
- **Large Containers**: 1rem (16px) for main dashboard panels.
- **Interactive States**: Focus rings should follow the curvature of the element with a 2px offset.

## Components

### Navigation
- **Sidebar**: Neutral background with a "Coral" vertical 2px indicator for the active state. Icons should be stroke-based (linear) to maintain a lightweight feel.

### Buttons
- **Primary**: Solid Coral background with off-black text for maximum contrast.
- **Secondary**: Subtle charcoal background with a light border. On hover, the border brightness increases.
- **Ghost**: No background, Coral text. Used for low-priority actions like "Cancel" or "Clear."

### Inputs
- **Field**: Background matches the Surface color. Border is invisible until focus, where it transitions to a 1px Coral stroke. 
- **Focus**: A subtle 2px outer glow in Coral at 20% opacity.

### Cards
- Used only for grouping related data (e.g., specific Task details or Analytics). They should not have a background color different from the Surface unless they are hoverable.

### Progress Bars
- Background: `#2C2E30`.
- Fill: Solid Coral. For "Pro" sessions, use a subtle gradient from Coral to a slightly deeper orange-red.