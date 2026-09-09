# shadcn/ui

Chronicon adapts the shadcn/create configurator and Base UI preview templates from
[shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/3ba91b1cc83e1bbe4ab35a422ff2a694849c5048),
revision `3ba91b1cc83e1bbe4ab35a422ff2a694849c5048`.

Upstream source paths:

- `apps/v4/registry/themes.ts` and `apps/v4/registry/base-colors.ts`
- `apps/v4/registry/config.ts` (theme filtering, radii, token composition)
- `apps/v4/app/(app)/(create)/components/{customizer,base-color-picker,theme-picker,radius-picker,picker}.tsx`
- `apps/v4/registry/bases/base/ui/{card,checkbox}.tsx`
- `apps/v4/registry/styles/style-nova.css` (Card and Checkbox styles)
- `apps/v4/registry/bases/base/blocks/preview-02/cards/{notification-settings,empty-connect-bank}.tsx`

Local adaptations live in `src/lib/project-design`, `src/components/project-design`,
and the shared Card and Checkbox components. Chronicon uses controlled form state,
its own shared Base UI menus, project-scoped previews, local icons, and persistent
revision checks. The initial configurator uses Nova with Base UI, system fonts, and
the upstream paired palettes, chart colors, menu accents, and radius choices.
Palette values are copied unchanged. Website routing, account flows, randomization,
style code generation, and remote font assets are omitted.

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
