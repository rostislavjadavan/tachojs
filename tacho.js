var Tacho = {
    name: 'tachojs',
    version: '2.1',
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
    minifier: require('html-minifier')
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
    constructor(path, config) {
        Tacho.logger.debug("[Tacho.Page] loading file: " + path);
        this.path = path;
        this.config = config;
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

        if (this.config.has('minify') && this.config.get('minify')) {
            return Tacho.minifier.minify(content, {
                html5: true,
                minifyCSS: true,
                minifyJS: true,
                removeTagWhitespace: true,
                collapseWhitespace: true,
                removeComments: true
            });
        } else {
            return content;
        }

    }
}

Tacho.Config = class {
    constructor() {
        this.data = {};
    }
    load(path) {
        Tacho.logger.info('[Tacho.Config] loading file: ' + path);
        this.data = Tacho.yaml.safeLoad(Tacho.fse.readFileSync(path).toString());
        Tacho.logger.debug(this.data);
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
    constructor(path, params) {
        this.path = path;
        this.params = params;
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
        if (this.params.hasOwnProperty("extraConfig")) {
            let extraConfig = new Tacho.Config();
            extraConfig.load(this.path + "/" + this.params.extraConfig);
            this.config.data = { ...this.config.data, ...extraConfig.data };
        }

        Tacho.PartialsHelper.register(this.path, this.config);

        let templates = [];
        Tacho.globby.sync([this.path + "/" + Tacho.templatesDir + '/**/*.html']).forEach(path => {
            const template = new Tacho.Page(path, this.config);
            Tacho.logger.debug(template);
            templates.push(template);
        });

        const inPath = this.path;
        const outPath = Tacho.outputDirPrefix + this.siteName;
        Tacho.globby.sync([this.path + "/" + Tacho.pagesDir + '/**/*.html']).forEach(path => {
            let page = new Tacho.Page(path, this.config);
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

                Tacho.logger.info('[Tacho.Site] copying ' + source + ' -> ' + target);
                Tacho.fse.copydirSync(source, target);
            });
        }
        Tacho.logger.info('[Tacho.Site] building site done!');
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
        Tacho.logger.info("[Tacho.Site] writing page: " + outPath);
        Tacho.fse.mkdirSync(Tacho.PathHelper.dirname(outPath), { recursive: true });
        Tacho.fse.writeFileSync(outPath, content);
    }
}

Tacho.PartialsHelper = class {
    static register(path, config) {
        Tacho.globby.sync([path + "/" + Tacho.partialsDir + '/**/*.html']).forEach(path => {
            const partial = new Tacho.Page(path, config);
            Tacho.PartialsHelper.partials.push(partial);
            Tacho.logger.debug("[PartialsHelper] loaded partial: " + partial.filename);
        });

        Tacho.hb.registerHelper('partial', (partialName) => {
            let partials = Tacho.PartialsHelper.partials.filter(p => p.filename == partialName);
            if (partials != null && partials.length > 0) {
                Tacho.logger.debug("[PartialsHelper] rendering partial" + partials[0].filename);
                return partials[0].render(config.data, []);
            } else {
                return "";
            }
        });
    }
}
Tacho.PartialsHelper.partials = [];

Tacho.App = class {
    static main() {
        Tacho.program
            .version(Tacho.version)
            .option('-c, create [site]', 'Create new site')
            .option('-b, build [site]', 'Build site')
            .option('-e, extraconfig [config]', 'Extra config name to include')
            .option('-d, debug', 'Show debug output')
            .parse(process.argv);

        Tacho.logger.level = 'info';
        if (Tacho.program.debug) {
            Tacho.logger.level = 'debug';
        }

        Tacho.logger.info('tachojs version=' + Tacho.version + ", logging=" + Tacho.logger.level);

        if (Tacho.program.create) {
            (new Tacho.Site(Tacho.program.create, {})).create();
        } else if (Tacho.program.build) {
            let params = {}
            if (Tacho.program.extraconfig) {
                params.extraConfig = Tacho.program.extraconfig;
            }
            (new Tacho.Site(Tacho.program.build, params)).build();
        } else {
            Tacho.logger.info('no input command');
        }
    }
}

Tacho.App.main();
