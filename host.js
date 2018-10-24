/*
 * Copyright 2018 Google LLC. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * @fileoverview Exports Koa middleware to serve the Chrome Dev Summit site at '/'.
 */

'use strict';

const fs = require('fs');
const flat = require('./deps/router.js');
const hbs = require('koa-hbs');
const Koa = require('koa');
const mount = require('koa-mount');
const policy = require('./deps/policy.js');
const less = require('less');
const calendar = require('./deps/calendar.js')
const send = require('koa-send');
const serve = require('koa-static');
require('./helpers.js');  // side-effects only

const app = new Koa();
const isProd = (process.env.NODE_ENV === 'production');

const schedule = require('./schedule.json');
const days = calendar.days(schedule);

// save policy string
const policyHeader = policy(isProd);

if (isProd) {
  app.use(mount('/res', serve('res')));        // runtime build assets
} else {
  app.use(mount('/static', serve('static')));  // app.yaml serves this in prod
  app.use(mount('/src', serve('src')));        // actual source folder
  app.use(mount('/node_modules', serve('node_modules')));
}

// In prod, we want to render AMP CSS from the generated file directly.
function readProdAmpCss() {
  const p = `${__dirname}/res/amp.css`;
  try {
    return fs.readFileSync(p);
  } catch (err) {
    // not found for some reason
  }
  return undefined;
}
const prodAmpCss = isProd ? readProdAmpCss() : undefined;
let fallbackProdAmpCss = undefined;

// Serve sw.js from top-level.
const sourcePrefix = isProd ? 'res' : 'src';
app.use(async (ctx, next) => {
  if (ctx.path === '/sw.js') {
    return send(ctx, `${sourcePrefix}/sw.js`);
  }
  return next();
});

// Serve schedule.json from top-level.
app.use(async (ctx, next) => {
  if (ctx.path === '/schedule.json') {
    return send(ctx, `schedule.json`);
  }
  if (ctx.path === '/googlec6dfdf23945d0d0c.html') {
    return send(ctx, `googlec6dfdf23945d0d0c.html`);
  }
  return next();
});

app.use(hbs.middleware({
  viewPath: `${__dirname}/sections`,
  layoutsPath: `${__dirname}/templates`,
  partialsPath: `${__dirname}/partials`,
  extname: '.html',
}));


const sections = fs.readdirSync(`${__dirname}/sections`)
    .map((section) => {
      if (section.endsWith('.html') && section[0] !== '_') {
        return section.substr(0, section.length - 5);
      }
    }).filter(Boolean);

/**
 * Gets the URL prefix where this site is mounted with Koa, without the trailing /.
 * @param {!Object} ctx
 * @return {string}
 */
function mountUrl(ctx) {
  if (ctx.originalUrl === undefined) {
    return '';
  }
  const index = ctx.originalUrl.lastIndexOf(ctx.url);
  if (index === -1) {
    return '';
  }
  return ctx.originalUrl.slice(0, index);
}

app.use(flat(async (ctx, next, path, rest) => {
  if (sections.indexOf(path) === -1) {
    return next();
  }

  // derive the mount path from Koa, so this doesn't need to have it as a const
  const basepath = mountUrl(ctx);
  const hostname = ctx.req.headers.host;
  const sitePrefix = (isProd ? 'https://' : 'http://') + hostname + basepath;

  const scope = {
    year: 2018,
    prod: isProd,
    base: basepath,
    layout: 'devsummit',
    ua: 'UA-41980257-1',
    conversion: 935743779,
    sourcePrefix,
    days,
  };

  if (rest) {
    if (path !== 'schedule') {
      return next();
    }

    // lookup schedule and check ID doesn't start with _
    const data = schedule.sessions[rest];
    if (!data || rest.startsWith('_')) {
      return next();
    }

    let css = prodAmpCss || fallbackProdAmpCss;
    if (css === undefined) {
      // We provide a "fake" file to Less.CSS, as otherwise it needs the file and its filename.
      const filename = `${__dirname}/static/styles/amp.less`;
      const result = await less.render(`@import '${filename}';`);
      css = result.css;

      if (isProd) {
        console.debug('saving rendered CSS to fallback in prod', css.length, 'bytes');
        fallbackProdAmpCss = css;
      }
    }

    // render AMP for first session load
    scope.layout = 'amp';
    scope.sitePrefix = sitePrefix;
    scope.title = data.name || '';
    scope.time_label = data.time_label || '';
    scope.description = data.description || '',
    scope.payload = data;
    scope.styles = css;
    path = '_amp-session';
  }

  ctx.set('Feature-Policy', policyHeader);
  await ctx.render(path, scope);
}));

module.exports = app;
