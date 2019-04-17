const fse = require('fse');
const path = require('path');
const globby = require('globby');
const yaml = require('js-yaml');
const hb = require('handlebars')
const log4js = require('log4js');
const logger = log4js.getLogger();
const program = require('commander');

logger.level = 'debug';

var Tacho = {
    name: 'tachojs',
    version: '2.0'
}

Tacho.File = class {
    constructor(path) {
        logger.info("[Tacho.File] loading file: " + path);

        this.path = path;
        this.filename = path.replace(/^.*[\\\/]/, '');
        const re = /---([\w\W\n\s]+?)---/;        
        const content = fse.readFileSync(path).toString();
        const rawContent = content.replace(re, "");
        const matches = content.match(re);
        this.data = matches ? yaml.safeLoad(matches[1]) : null;
        this.hbTtemplate = hb.compile(rawContent)
    }
}

Tacho.Config = class {
    constructor(path) {
        try {
            logger.info('[Tacho.Config] loading site config: ' + path);
            this.path = path;
            this.data = yaml.safeLoad(fse.readFileSync(path).toString());
        } catch (err) {
            logger.error('[Tacho.Config] site config error (' + path + '): ' + err);
        }
    }
}

var page = new Tacho.File("example/pages/index.html");
var tpl = new Tacho.File("example/templates/default.html");
var config = new Tacho.Config("example/config.yaml");

console.log(page);
console.log(tpl);
console.log(config);