# RecallLedger interface design

Concept: `src/web/design-concept.png`, generated with built-in Image Gen 2026-10-26. The concept is a layout/palette reference, not transaction evidence. No raster screenshot is shipped as interactive UI.

## Locked design system
- Canvas #F6F7FB; white surface; text #18212F; secondary #526174; border #DDE3EB; action #166F63.
- System sans; tabular amounts; open summary columns and two-panel desktop inbox; 12px outer frame, 9px panels, 6px controls.
- Brand, three-item navigation, source environment label, heading, summary, budget, transfer list and detail follow the concept hierarchy.
- Responsive: one-column workspace at <=1000px, compact 3-column summary and stacked hero action at <=560px; no small-screen hidden source labels.
- Minimum 44px controls; focus outline; native modal dialog with Escape and restored focus; reduced motion disables transitions.

## Intentional correctness deviations from generated concept
- Generated fake addresses, block, date, receipt contents, 5–15 range and implied merchant identity are rejected. All records, amounts, reasons and rule scopes come from the API/domain projection.
- The generated phone inset is a responsive reference, not a page element.
- Additional manual forms, pending step and sandbox notice are required working states absent in the single-screen image.
- Read-only view has no active write controls; primary CTA opens an explicitly temporary synthetic sandbox.
- Restore is labeled local fixture replay, not cross-process/Walrus cold restore. No invented memory IDs.

## Functional verification
- `vitest run tests/web`: two tests passed, including all twelve editable UI payload contracts through prepare → pending (unchanged snapshot) → explicit fixture complete.
- `tsc --noEmit`: passed.
- `vite build`: passed.
- Actual browser screenshots and responsive/interaction verification are owned by the independent browser-QA agent. Do not infer visual acceptance from these compile checks.
