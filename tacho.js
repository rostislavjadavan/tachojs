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
    assetsDir: 'assets',
    outputDirPrefix: 'dist-'
}

Tacho.Page = class {
    constructor(path) {
        logger.debug("[Tacho.Page] loading file: " + path);
        this.path = path;
        this.filename = path.replace(/^.*[\\\/]/, '');
        let content = fse.readFileSync(path).toString();
        const re = /[-]+([\w\W\n\s]+?)[-]+/;
        const rawContent = content.replace(re, "");
        const matches = content.match(re);
        this.data = matches ? yaml.safeLoad(matches[1]) : null;
        this.hbTemplate = hb.compile(rawContent);
    }

    render(data, templates) {
        let mergedData = { ...data, ...this.data };
        let content = this.hbTemplate(mergedData);

        if (this.data != null && this.data.hasOwnProperty('template') && templates) {
            const template = templates.filter(template => template.filename == this.data.template);
            if (template.length > 0) {
                mergedData.content = content;
                content = template[0].hbTemplate(mergedData);
            }
        }
        return content;
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
    set(key, value) {
        this.data[key] = value;
    }
    addToArray(key, value) {
        if (!this.data.hasOwnProperty(key)) {
            this.data[key] = [];
        }
        this.data[key] = [value, ...this.data[key]];
    }
    get(key) {
        return this.data.hasOwnProperty(key) ? this.data[key] : null;
    }
    has(key) {
        return this.data.hasOwnProperty(key);
    }
}

Tacho.Site = class {
    constructor(path) {
        this.path = path;
        this.siteName = this.path.replace(/^.*[\\\/]/, '');
        this.config = new Tacho.Config();
    }

    create() {
        [
            this.path,
            this.path + "/" + Tacho.templatesDir,
            this.path + "/" + Tacho.partialsDir,
            this.path + "/" + Tacho.pagesDir,
            this.path + "/" + Tacho.assetsDir
        ].forEach(dir => fse.mkdirSync(dir));

        this.config.set("title", this.siteName);
        this.config.set("coppyAssets", ["assets"]);
        this.config.save(this.path + "/" + Tacho.configFilename);
        logger.info("[Tacho.Site] site " + this.siteName + " has been created! ");
    }

    build() {
        this.config.load(this.path + "/" + Tacho.configFilename);                    
        
        let templates = [];
        globby.sync([this.path + "/" + Tacho.templatesDir + '/**/*.html']).forEach(path => {
            templates.push(new Tacho.Page(path));
        });

        let partials = [];
        globby.sync([this.path + "/" + Tacho.partialsDir + '/**/*.html']).forEach(path => {
            partials.push(new Tacho.Page(path));
        });
        
        const inPath = this.path;
        const outPath = Tacho.outputDirPrefix + this.siteName;
        globby.sync([this.path + "/" + Tacho.pagesDir + '/**/*.html']).forEach(path => {
            let page = new Tacho.Page(path);
            this.writePage(outPath + "/" + this.getPath(page), page.render(this.config.data, templates));
        });
        
        if (this.config.has('copyAssets')) {            
            this.config.get('copyAssets').forEach(dir => {
                const source = inPath + '/' + dir;
                const target = outPath + '/' + dir;
    
                logger.info('copy ' + source + ' -> ' + target);
                fse.copydirSync(source, target);
            });            
        }
    }

    getPath(page) {
        if (page.data != null && page.data.hasOwnProperty('url')) {
            const url = page.data.url.trim().replace(/^\/|\/$/g, '');
            if (url == '') {
                return page.filename;
            }
            if (url == '/') {
                return 'index.html';
            }
    
            const re = /(?:\.([^.]+))?$/;
            const ext = re.exec(url)[1];
            if (ext == 'undefined' || ext != 'html') {
                return url + '.html';
            }
            return url;
        }
        return page.filename;
    }

    writePage(outPath, content) {
        fse.mkdirSync(path.dirname(outPath), { recursive: true });
        fse.writeFileSync(outPath, content);
    }
}

//var site = new Tacho.Site('example2');
//site.create();

var site = new Tacho.Site('example');
site.build();

/*
var config = new Tacho.Config();
config.load("example/config.yaml");
config.set("testkey", "testvalue");
config.addToArray("array", "testvalue1");
config.addToArray("array", "testvalue2");
config.addToArray("array", "testvalue3");
console.log(config);
*/

/*
var page = new Tacho.Page("example/pages/index.html");
var tpl = new Tacho.Page("example/templates/default.html");
var config = new Tacho.Config();
config.load("example/config.yaml");
config.set("testkey", "testvalue");
config.save("example/config_test.yaml");

console.log(page);
console.log(tpl);
console.log(config);
*/