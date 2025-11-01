const { src, dest, parallel } = require('gulp');

// Copy icon files to dist
function copyIcons() {
	return src('nodes/**/*.{svg}')
		.pipe(dest('dist/nodes'));
}

exports.build = parallel(copyIcons);
exports.default = exports.build;
