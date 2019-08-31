var Tacho = {
    name: 'tachojs',
    version: '2.0',
    configFilename: 'config.yaml',
    templatesDir: 'templates',
    partialsDir: 'partials',
    pagesDir: 'pages',
    assetsDir: 'assets',
    outputDirPrefix: 'dist-',
    hb: require('handlebars'),
    fse: require('fse'),
    globby: require('globby'),
    yaml: require('js-yaml'),
    logger: require('log4js').getLogger(),
    program: require('commander'),
    path: require('path'),
}

Tacho.PathHelper = class {
    static removeSiteAndSubDirectory(path) {
        return path.replace(path.split("/", 2).join("/") + "/", "");
    }
    static filename(path) {
        return Tacho.path.basename(path)
    }

    static dirname(path) {        
        return Tacho.path.dirname(path)     
    }
}

Tacho.Page = class {
    constructor(path) {
        Tacho.logger.debug("[Tacho.Page] loading file: " + path);
        this.path = path;
        this.innerPath = Tacho.PathHelper.removeSiteAndSubDirectory(path);
        this.filename = Tacho.PathHelper.filename(path);
        let content = Tacho.fse.readFileSync(path).toString();
        const re = /[-]{2,99}([\w\W\n\s]+?)[-]{2,99}/;
        const rawContent = content.replace(re, "");
        const matches = content.match(re);
        this.data = matches ? Tacho.yaml.safeLoad(matches[1]) : null;
        this.hbTemplate = Tacho.hb.compile(rawContent);
    }

    render(data, templates) {
        let mergedData = { ...data, ...this.data };
        let content = this.hbTemplate(mergedData);

        if (this.data != null && this.data.hasOwnProperty('template') && templates) {
            const template = templates.filter(template => template.innerPath == this.data.template);
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
        Tacho.logger.info('[Tacho.Config] loading file: ' + path);
        this.data = Tacho.yaml.safeLoad(Tacho.fse.readFileSync(path).toString());
    }
    save(path) {
        Tacho.logger.info('[Tacho.Config] saving file: ' + path);
        Tacho.fse.writeFileSync(path, Tacho.yaml.safeDump(this.data));
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
        this.siteName = Tacho.PathHelper.filename(path);
        this.config = new Tacho.Config();
    }

    create() {
        [
            this.path,
            this.path + "/" + Tacho.templatesDir,
            this.path + "/" + Tacho.partialsDir,
            this.path + "/" + Tacho.pagesDir,
            this.path + "/" + Tacho.assetsDir
        ].forEach(dir => Tacho.fse.mkdirSync(dir));

        this.config.set("title", this.siteName);
        this.config.set("copyAssets", ["assets"]);
        this.config.save(this.path + "/" + Tacho.configFilename);
        Tacho.logger.info("[Tacho.Site] site " + this.siteName + " has been created! ");
    }

    build() {
        this.config.load(this.path + "/" + Tacho.configFilename);

        Tacho.InsertHelper.register(this.path, this.config);
        Tacho.PartialsHelper.register(this.path, this.config);

        let templates = [];
        Tacho.globby.sync([this.path + "/" + Tacho.templatesDir + '/**/*.html']).forEach(path => {
            const template = new Tacho.Page(path);
            Tacho.logger.debug(template);
            templates.push(template);
        });

        const inPath = this.path;
        const outPath = Tacho.outputDirPrefix + this.siteName;
        Tacho.globby.sync([this.path + "/" + Tacho.pagesDir + '/**/*.html']).forEach(path => {
            let page = new Tacho.Page(path);
            this.writePage(outPath + "/" + this.getPath(page), page.render(this.config.data, templates));
        });

        if (this.config.has('copyAssets')) {
            this.config.get('copyAssets').forEach(dir => {
                let source, target;
                if (dir instanceof Array && dir.length > 1) {
                    source = inPath + '/' + dir[0];
                    target = outPath + '/' + dir[1];
                } else {
                    source = inPath + '/' + dir;
                    target = outPath + '/' + dir;
                }

                Tacho.logger.info('copy ' + source + ' -> ' + target);
                Tacho.fse.copydirSync(source, target);
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
        Tacho.logger.debug("[Tacho.Site] writing page: " + outPath);
        Tacho.fse.mkdirSync(Tacho.PathHelper.dirname(outPath), { recursive: true });
        Tacho.fse.writeFileSync(outPath, content);
    }
}

Tacho.InsertHelper = class {
    static register(path, config) {
        Tacho.hb.registerHelper('insert', (filename) => {
            const finalPath = path + "/" + filename;
            Tacho.logger.debug("[InsertHelper] inserting file: " + finalPath);
            return Tacho.fse.readFileSync(finalPath).toString();
        });
    }
}

Tacho.PartialsHelper = class {
    static register(path, config) {
        Tacho.globby.sync([path + "/" + Tacho.partialsDir + '/**/*.html']).forEach(path => {
            const partial = new Tacho.Page(path);
            Tacho.PartialsHelper.partials.push(partial);
            Tacho.logger.debug("[PartialsHelper] loaded partial: " + partial.filename);
        });

        Tacho.hb.registerHelper('partial', (partialName, params) =>  {
            let partials = Tacho.PartialsHelper.partials.filter(p => p.filename == partialName);
            if (partials != null && partials.length > 0) {
                Tacho.logger.debug("[PartialsHelper] rendering partial" + partials[0].filename);
                let mergedData = config.data;
                let partialData = JSON.parse(params);
                if (partialData) {
                    mergedData = { ...mergedData, ...partialData };
                    Tacho.logger.debug(mergedData);
                }
                return partials[0].render(mergedData, []);
            } else {
                return "";
            }
        });
    }
}
Tacho.PartialsHelper.partials = [];

Tacho.App = class {
    static main() {
        Tacho.logger.level = 'debug';

        Tacho.program
            .version(Tacho.version)
            .option('-c, create [site]', 'Create new site')
            .option('-b, build [site]', 'Build site')
            .parse(process.argv);        

        if (Tacho.program.create) {            
            (new Tacho.Site(Tacho.program.create)).create();
        } else if (Tacho.program.build) {
            (new Tacho.Site(Tacho.program.build)).build();
        } else {
            Tacho.logger.info('No input command');
        }
    }
}

Tacho.App.main();
