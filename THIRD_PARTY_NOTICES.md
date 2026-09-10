# shadcn/ui

Chronicon adapts the shadcn/create configurator and Base UI preview templates from
[shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/3ba91b1cc83e1bbe4ab35a422ff2a694849c5048),
revision `3ba91b1cc83e1bbe4ab35a422ff2a694849c5048`.

Upstream source paths:

- `apps/v4/registry/themes.ts`, `base-colors.ts`, and `config.ts`
- `apps/v4/lib/font-definitions.ts` and `apps/v4/registry/styles.tsx`
- `apps/v4/app/(app)/(create)/components/{customizer,picker,style-picker,base-color-picker,theme-picker,radius-picker,font-picker,icon-library-picker,menu-picker,accent-picker}.tsx`
- `apps/v4/registry/styles/style-{vega,nova,maia,lyra,mira,luma,sera,rhea}.css`
- `apps/v4/registry/bases/base/ui/{card,checkbox,slider,progress}.tsx`
- `apps/v4/registry/bases/base/blocks/preview-02/cards/{contribution-history,payout-threshold,savings-targets,recent-transactions,claimable-balance,empty-distribute-track,notification-settings,empty-connect-bank}.tsx`

Local adaptations live in `src/lib/project-design`, `src/components/project-design`,
and the shared Card, Checkbox, Slider, and Progress components. The studio uses
Chronicon's controlled forms, authorization, and revision checks. All eight upstream
styles are scoped to the component gallery; their component selectors target shared
Base UI slots and radius utilities use local variables. Unused style sections are
omitted. Chart markup is accessible HTML instead of Recharts. Demo controls use
local sample state. Palette values and the font catalog are copied unchanged.

The studio offers all 26 upstream font families plus existing system fonts.
Latin font files are self-hosted from Fontsource packages; the browser loads a font
only when used. Exact package versions and source URLs are in
`public/fonts/design/sources.json`. Each font's license is beside its `.woff2` file.
Keep those license files when distributing the assets.

Lucide, Tabler, Phosphor, Remix Icon, and Hugeicons render using their official React
packages. Their copyright and license notices remain in the installed packages.
The studio uses Base UI throughout; it does not generate projects or switch to Radix.

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
