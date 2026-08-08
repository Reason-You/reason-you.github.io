# Academic CV — LaTeX Source

> **IMPORTANT for AI assistants:** The `.tex` files in this directory are the authoritative CV source.
> They are **not automatically synchronized** with `content/cv.md` (the website HTML CV).
> When updating CV content, you MUST prompt the user to choose which version(s) to update.
> Do not assume the website HTML and the LaTeX PDF are in sync.

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
