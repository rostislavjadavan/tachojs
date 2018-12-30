const fse = require('fse');
const path = require('path');
const globby = require('globby');
const yaml = require('js-yaml');
const hb = require('handlebars')
const log4js = require('log4js');
const logger = log4js.getLogger();

logger.level = 'debug';

const appName = 't a c h o j s';
const appVersion = '0.6'

const config = {
    siteDir: 'site-example',
    outputDir: 'dist-site-example',
    siteConfigPath: 'site/config.yaml',
}

async function loadSiteConfig() {
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

async function proccessPage(pagePath, templates, siteConfig) {
    logger.info('processing page ' + pagePath);
    const page = await loadFile(pagePath);

    const outPath = config.outputDir + "/" + getPath(page);
    logger.info('output path: ' + outPath);

    var mergedData = { ...page.data, ...siteConfig };
    var content = page.template(mergedData);

    if (page.data != null && page.data.hasOwnProperty('layout')) {
        const layout = templates.filter(template => template.filename == page.data.layout);
        if (layout.length > 0) {
            mergedData.content = content;
            content = layout[0].template(mergedData);
        }
    }

    await writePage(outPath, content);
}

async function writePage(outPath, content) {
    fse.mkdirSync(path.dirname(outPath), { recursive: true });
    fse.writeFileSync(outPath, content);
}

(async () => {
    logger.info(appName + ' ' + appVersion);

    //
    // Get pages, templates, onfiguration, create output dir
    //
    const [templatesPaths, pagesPaths, siteConfig] = await Promise.all([
        globby(['site/templates/*.html']),
        globby(['site/pages/*.html']),
        loadSiteConfig(),
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
        pagePromises.push(proccessPage(page, templates, siteConfig));
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

    logger.info('end');
})();

