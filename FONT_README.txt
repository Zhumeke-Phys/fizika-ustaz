All site text is styled with Times New Roman. If the user's device does not have the font, its serif fallback is used.
Microsoft Times New Roman files are not included because this project does not hold redistribution rights. The included Liberation Serif is an open-source, metrically compatible fallback.
To embed licensed Times New Roman in downloadable PDFs: place a legally licensed TrueType regular font file at public/fonts/TimesNewRoman.ttf. The PDF exporter checks this path first, otherwise it uses public/serif.ttf. Ensure the font includes Kazakh Cyrillic and Greek glyphs.
For browser-wide exact font delivery, after obtaining an appropriate webfont license add an @font-face rule pointing to the licensed font. Test fractions, roots, Greek and Kazakh on each target browser.
Word files specify Times New Roman 14 pt and use editable native Office Math (OMML) rather than formula images.
