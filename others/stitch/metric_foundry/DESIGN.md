# Design System Specification: The Architectural Intelligence

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Architect."** 

In a world of cluttered, "off-the-shelf" enterprise dashboards, this system rejects the noise. It treats data not as a series of boxes, but as an editorial narrative. We move beyond "standard blue dashboards" by utilizing sophisticated tonal layering, intentional asymmetry, and a rigorous "No-Line" philosophy. The result is a high-end, authoritative experience that feels custom-built for high-stakes decision-making. We are not just showing data; we are curating insights through an atmosphere of quiet efficiency and structural depth.

## 2. Colors: Tonal Depth & The No-Line Rule
The palette is rooted in the "Architectural Blue" and "Enterprise Emerald." However, the secret to a premium feel lies in the neutral surface tokens, not just the primary colors.

### The Color Logic
*   **Primary (`#00288e` / `#1e40af`):** Used for primary actions and authoritative brand moments.
*   **Tertiary (`#003d27` / `#005236`):** Our "Success" state is treated with a deep, sophisticated green to avoid "traffic light" cheapness.
*   **Neutrals:** We utilize the `surface` tokens to build a world of "ink and paper."

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section off areas. Structural boundaries must be defined solely through background color shifts. 
*   Place a `surface_container_lowest` (Pure White) card atop a `surface_container_low` background. 
*   The human eye perceives the transition in luminance as a boundary, creating a cleaner, more sophisticated interface than a rigid stroke ever could.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
1.  **Base Layer:** `surface` (`#f7f9fb`) — The canvas.
2.  **Sectioning Layer:** `surface_container_low` — Large layout blocks.
3.  **Active Component Layer:** `surface_container_lowest` (`#ffffff`) — The primary card surface.

### The "Glass & Gradient" Rule
To add "soul," main CTAs and hero data points should utilize a subtle linear gradient from `primary` (`#00288e`) to `primary_container` (`#1e40af`). For floating navigation or modal overlays, apply **Glassmorphism**: use a semi-transparent `surface` color with a `20px` backdrop-blur to allow the data beneath to softly bleed through.

## 3. Typography: Editorial Authority
We use **Inter** not as a default, but as a precision tool. The hierarchy is designed to mimic a high-end financial journal.

*   **Display & Headline (The Statement):** Use `display-sm` (2.25rem) for hero metrics. The tight letter-spacing of Inter at this size provides a "brutalist" but clean authority.
*   **Title (The Navigator):** `title-md` (1.125rem) serves as the primary card header. It should always be high-contrast (`on_surface`) to ensure immediate scannability.
*   **Body (The Insight):** `body-md` (0.875rem) is our workhorse. Ensure a line height of 1.5 to provide breathing room in data-heavy views.
*   **Label (The Metadata):** `label-md` (0.75rem) in `on_surface_variant` is used for supporting text, ensuring it recedes and allows the primary data to shine.

## 4. Elevation & Depth: Tonal Layering
Traditional "drop shadows" often feel muddy. This system uses **Ambient Shadows** and **Tonal Stacking**.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface_container_highest` sidebar next to a `surface` main content area creates a natural "step" in the UI without a single line or shadow.
*   **Ambient Shadows:** For floating elements (Modals, Popovers), use a multi-layered shadow:
    *   `box-shadow: 0 4px 6px -1px rgba(0, 40, 175, 0.04), 0 10px 15px -3px rgba(0, 40, 175, 0.08);`
    *   Note the blue tint in the shadow—this mimics natural light refraction better than a grey shadow.
*   **The "Ghost Border":** If a table header requires separation, use a 1px border of `outline_variant` at **20% opacity**. It should be felt, not seen.

## 5. Components

### Cards & Data Containers
*   **Style:** `surface_container_lowest` background, `DEFAULT` (8px) rounded corners.
*   **Rule:** No dividers between card sections. Use `1.5rem` (xl) internal padding to separate the header from the content.

### Interactive Data Visuals (Recharts-style)
*   **Line Charts:** Use a 3px stroke width for the primary data line. Add a subtle area gradient below the line using `primary_fixed_dim` at 10% opacity fading to 0%.
*   **Tooltips:** Must use Glassmorphism. A white semi-transparent background with a 12px blur ensures the tooltip feels like it's floating above the data, not obscuring it.

### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`). `0.5rem` (DEFAULT) rounding. White text.
*   **Secondary:** No fill. `outline` border at 30% opacity. Text in `on_surface`.
*   **Tertiary:** No fill, no border. Purely typographic with `primary` color text.

### Data Tables
*   **Structure:** Forbid horizontal lines. Use a subtle `surface_container_low` background on every other row (Zebra striping) only if the table exceeds 10 rows. 
*   **Header:** `label-md` uppercase with increased letter-spacing, using `on_surface_variant`.

### Input Fields
*   **State:** Default state uses `surface_container_high` as a background. On focus, the background shifts to `surface_container_lowest` with a 2px `primary` "Ghost Border" (at 40% opacity).

## 6. Do's and Don'ts

### Do
*   **DO** use whitespace as a structural element. If you think you need a line, try adding `1rem` of padding instead.
*   **DO** use the `tertiary` green for growth metrics and `error` red for declines, but keep them small (Labels/Chips) to maintain the "Architectural Blue" dominance.
*   **DO** align all text to a rigorous grid, but allow data visualizations to "break out" and occupy larger, asymmetrical areas of the screen.

### Don't
*   **DON'T** use pure black (#000000) for text. Always use `on_surface` to keep the contrast high-end rather than harsh.
*   **DON'T** use 100% opaque borders. They trap the eye and make the dashboard feel like an Excel sheet.
*   **DON'T** use standard "Success Green." Use the `tertiary` tokens provided for a more sophisticated, "Forest" success state.