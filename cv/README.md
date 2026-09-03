# Academic CV — LaTeX Source

> **For AI assistants:** See [`../AGENTS.md`](../AGENTS.md) for project-wide rules
> (sync scope, date granularity, build and deploy).

English and Chinese academic CVs of You Li (李由).

| | Source | Published PDF |
|---|---|---|
| English | `cv/cv.tex` | `public/files/You_Li_CV.pdf` |
| Chinese | `cv/cv_cn.tex` | `public/files/You_Li_CV_CN.pdf` |

Both CVs are 2-page A4 documents.

## Dependencies

- XeLaTeX (part of TeX Live)
- latexmk
- LaTeX packages: `libertinus`, `libertinus-otf`, `libertinus-fonts`, `fontspec`, `xeCJK`, `enumitem`, `tabularx`, `array`, `needspace`, `microtype`, `xcolor`, `hyperref`, `ragged2e`

## Usage

```bash
cd cv && make          # Compile English
cd cv && make cn       # Compile Chinese
cd cv && make publish  # Compile both and copy PDFs to public/files/
cd cv && make clean    # Remove all build artifacts
```

## Content Updates

Edit the corresponding `.tex` file directly, then run `make publish`. Publication entries use natural LaTeX page breaking — do not insert manual page breaks inside the publication list.

After updating, rebuild the site (`npm run build`) and commit the updated source and PDF files.
