const fse = require('fse');
const path = require('path');
const globby = require('globby');
const yaml = require('js-yaml');
const hb = require('handlebars')
const log4js = require('log4js');
const logger = log4js.getLogger();
const program = require('commander');

logger.level = 'debug';

const appName = 'tachojs';
const appVersion = '0.6'

function createConfig(site) {
    return {
        siteDir: site,
        outputDir: 'dist-' + site,
        siteConfigPath: site + '/config.yaml',
        pagesDir: site + '/pages',
        templatesDir: site + '/templates',
    }
}

async function loadSiteConfig(config) {
    try {
        logger.info('loading site config: ' + config.siteConfigPath);
        return yaml.safeLoad(fse.readFileSync(config.siteConfigPath).toString());
    } catch (err) {
        logger.error('site config error (' + config.siteConfigPath + '): ' + err);
    }
}

async function loadFile(path) {
    const filename = path.replace(/^.*[\\\/]/, '');
    const re = /---([\w\W\n\s]+?)---/;

    try {
        const content = fse.readFileSync(path).toString();
        const rawContent = content.replace(re, "");
        const matches = content.match(re);

        return {
            filename: filename,
            path: path,
            data: matches ? yaml.safeLoad(matches[1]) : null,
            template: hb.compile(rawContent)
        };
    } catch (err) {
        logger.error(err);
        return {
            filename: filename,
            path: path,
            data: null,
            content: err
        }
    }
}

function getPath(page) {
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

async function proccessPage(pagePath, templates, config, siteConfig) {
    logger.info('processing page ' + pagePath);
    const page = await loadFile(pagePath);

    const outPath = config.outputDir + "/" + getPath(page);
    logger.info('output path: ' + outPath);

    var mergedData = { ...page.data, ...siteConfig };
    var content = page.template(mergedData);

    if (page.data != null && page.data.hasOwnProperty('template')) {
        const template = templates.filter(template => template.filename == page.data.template);
        if (template.length > 0) {
            mergedData.content = content;
            content = template[0].template(mergedData);
        }
    }

    await writePage(outPath, content);
}

async function writePage(outPath, content) {
    fse.mkdirSync(path.dirname(outPath), { recursive: true });
    fse.writeFileSync(outPath, content);
}

async function commandBuild(site) {
    const config = createConfig(site);

    //
    // Get pages, templates, configuration, create output dir
    //
    const [templatesPaths, pagesPaths, siteConfig] = await Promise.all([
        globby([config.templatesDir + '/*.html']),
        globby([config.pagesDir + '/*.html']),
        loadSiteConfig(config),
        fse.mkdir(config.outputDir)
    ]);

    //
    // Load templates 
    //
    let templatePromises = [];
    templatesPaths.forEach(template => {
        templatePromises.push(loadFile(template));
    });
    const templates = await Promise.all(templatePromises);

    //
    // Load and process pages
    //
    let pagePromises = [];
    pagesPaths.forEach(page => {
        pagePromises.push(proccessPage(page, templates, config, siteConfig));
    });
    await Promise.all(pagePromises);

    //
    // Copy assets
    //
    if (siteConfig != null && siteConfig.hasOwnProperty('copyAssets') && siteConfig.copyAssets.length > 0) {
        let copyPromises = [];
        siteConfig.copyAssets.forEach(dir => {
            const source = config.siteDir + '/' + dir;
            const target = config.outputDir + '/' + dir;

            logger.info('copy ' + source + ' -> ' + target);
            copyPromises.push(fse.copydir(source, target));
        });
        await Promise.all(copyPromises);
    }
}

async function commandCreate(site) {
    if (fse.existsSync(site)) {
        logger.error('site ' + site + ' already exists!');
        return;
    }

    const config = createConfig(site);
    logger.debug(config);

    try {
        fse.mkdirSync(config.siteDir);
        fse.mkdirSync(config.templatesDir);
        fse.mkdirSync(config.pagesDir);
        fse.mkdirSync(config.siteDir + '/assets');

        const configFileContent =
            '# ' + site + ' config\n\n\
title: ' + site + '\n\
copyAssets:\n \
    - assets';
        fse.writeFileSync(config.siteConfigPath, configFileContent);
        logger.info('site has been created!')
    } catch (err) {
        logger.error(err);
    }

}

(async () => {
    logger.info(appName + ' v' + appVersion);

    program
        .version(appVersion)
        .option('-c, create [site]', 'Create new site')
        .option('-b', 'build [site]', 'Build site')
        .parse(process.argv);

    if (program.create) {
        await commandCreate(program.create);
    }
    if (program.build) {
        await commandBuild(program.site);
    }
})();

