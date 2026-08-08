TEX := cv.tex
TEX_CN := cv_cn.tex
OUTDIR := ../public/files
TARGET := $(OUTDIR)/You_Li_CV.pdf
TARGET_CN := $(OUTDIR)/You_Li_CV_CN.pdf

.PHONY: all cn publish clean

all: cv.pdf

cn: cv_cn.pdf

cv.pdf: $(TEX)
	latexmk -xelatex -interaction=nonstopmode -halt-on-error $(TEX)

cv_cn.pdf: $(TEX_CN)
	latexmk -xelatex -interaction=nonstopmode -halt-on-error $(TEX_CN)

publish: cv.pdf cv_cn.pdf
	mkdir -p $(OUTDIR)
	cp cv.pdf $(TARGET)
	cp cv_cn.pdf $(TARGET_CN)

clean:
	latexmk -C $(TEX)
	latexmk -C $(TEX_CN)
	rm -f *.synctex.gz
