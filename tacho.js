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
    version: '2.0',
    configFilename: 'config.yaml',
    templatesDir: 'templates',
    partialsDir: 'partials',
    pagesDir: 'pages',
    assetsDir: 'assets'
}

Tacho.Page = class {
    constructor(path) {
        logger.debug("[Tacho.Page] loading file: " + path);
        this.path = path;
        this.filename = path.replace(/^.*[\\\/]/, '');
        let content = fse.readFileSync(path).toString();        
        const re = /---([\w\W\n\s]+?)---/;
        const rawContent = content.replace(re, "");
        const matches = content.match(re);
        this.data = matches ? yaml.safeLoad(matches[1]) : null;
        this.hbTtemplate = hb.compile(rawContent);
    }
}

Tacho.Config = class {
    constructor() {
        this.data = {};
    }
    load(path) {
        logger.info('[Tacho.Config] loading file: ' + path);
        this.data = yaml.safeLoad(fse.readFileSync(path).toString());
    }
    save(path) {
        logger.info('[Tacho.Config] saving file: ' + path);
        fse.writeFileSync(path, yaml.safeDump(this.data));
    }
    add(key, value) {
        this.data[key] = value;
    }
    get(key) {
        this.data.hasOwnProperty(key) ? this.data[key] : null;
    }
}

Tacho.Site = class {
    constructor(path) {
        this.path = path;
        this.config = new Tacho.Config();
    }

    create() {
        fse.mkdirSync(this.path);
        fse.mkdirSync(this.path + "/" + Tacho.templatesDir);
        fse.mkdirSync(this.path + "/" + Tacho.partialsDir);        
        fse.mkdirSync(this.path + "/" + Tacho.pagesDir);
        fse.mkdirSync(this.path + "/" + Tacho.assetsDir);

        this.config.add("title", this.path.replace(/^.*[\\\/]/, ''));
        this.config.add("coppyAssets", ["assets"]);
        this.config.save(this.path + "/" + Tacho.configFilename);
        console.log(this.config);
    }

    build() {

    }
}

var site = new Tacho.Site('example2');
site.create();

/*
var page = new Tacho.Page("example/pages/index.html");
var tpl = new Tacho.Page("example/templates/default.html");
var config = new Tacho.Config();
config.load("example/config.yaml");
config.add("testkey", "testvalue");
config.save("example/config_test.yaml");

console.log(page);
console.log(tpl);
console.log(config);
*/