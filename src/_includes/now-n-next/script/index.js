import { html } from '../../../script/escape-html';
import * as styles from 'classnames:_includes/now-n-next/style.css';
import * as speakerStyles from 'classnames:_includes/speakers.css';
import * as utilsStyles from 'classnames:_includes/utils.css';
import { path } from 'confbox-config:';

const upNextEl = document.querySelector('.' + styles.upNext);
const onNowEl = document.querySelector('.' + styles.onNow);
const rootEl = document.querySelector('.' + styles.root);
const livestreamEl = document.querySelector('.' + styles.livestream);
const schedule = self.basicSchedule;

const getNow = () =>
  Number(new URL(location).searchParams.get('now')) || Date.now();

class RelativeTime extends HTMLElement {
  static get observedAttributes() {
    return ['time'];
  }

  _update() {
    const time = Number(this.getAttribute('time'));
    if (!time) {
      this.innerHTML = '';
      return;
    }

    const now = getNow();
    const delta = now - time;

    const minDelta = Math.abs(Math.round(delta / (1000 * 60)));
    const displayedMins = minDelta % 60;
    const displayedHours = (minDelta - displayedMins) / 60;

    const renderedTime = html`
      ${displayedHours
        ? html`
            <strong>${displayedHours}</strong>
            hour${displayedHours === 1 ? '' : 's'}
          `
        : ''}
      ${displayedMins
        ? html`
            <strong>${displayedMins}</strong>
            minute${displayedMins === 1 ? '' : 's'}
          `
        : ''}
    `;

    if (delta < 0) {
      if (minDelta === 0) {
        this.innerHTML = 'Starting soon';
        return;
      }

      this.innerHTML = html`
        in ${renderedTime}
      `;
      return;
    }

    if (minDelta === 0) {
      this.innerHTML = 'Just started';
      return;
    }

    this.innerHTML = html`
      started ${renderedTime} ago
    `;
  }

  connectedCallback() {
    this._update();
    this._interval = setInterval(() => this._update(), 1000 * 60);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }

  attributeChangedCallback() {
    this._update();
  }
}

customElements.define('rel-time', RelativeTime);

function getCurrentScheduleIndex(now) {
  for (const [i, item] of [...schedule.entries()].reverse()) {
    if (now >= item.start) return i;
  }
  return -1;
}

function updateOnNow(item) {
  return html`
    ${item.livestreamed
      ? html`
          <div class="${styles.liveNow}">Live now</div>
        `
      : html`
          <div class="${styles.happeningNow}">Happening now</div>
        `}
    <h1 class="${styles.nowTitle}">
      ${item.session
        ? html`
            <a href="${path}sessions/${item.fileSlug}">${item.title}</a>
          `
        : item.title}
    </h1>
    ${item.livestreamed
      ? html`
          <rel-time class="${styles.relTime}" time="${item.start}"></rel-time>
        `
      : ''}
    ${item.speakers
      ? html`
          <ul class="${speakerStyles.speakerlist} ${styles.speakerList}">
            ${item.speakers.map(
              speaker => html`
                <li class="${speakerStyles.speaker} ${styles.speaker}">
                  <img
                    src="${speaker.avatar}"
                    class="${speakerStyles.speakerAvatar}"
                    alt=""
                  />
                  <div class="${speakerStyles.speakerCreds}">
                    <div class="${speakerStyles.speakerName}">
                      ${speaker.link
                        ? html`
                            <a
                              href="${speaker.link}"
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              ${speaker.name}
                            </a>
                          `
                        : speaker.name}
                    </div>
                    <div class="${speakerStyles.speakerTitle}">
                      ${speaker.title}
                    </div>
                  </div>
                </li>
              `,
            )}
          </ul>
        `
      : ''}
  `;
}

function updateOnNext(item) {
  if (!item) return '';

  return html`
    <div class="${styles.upNextInner}">
      <div class="${styles.nextLabel}">Up Next →</div>
      <h1 class="${styles.nextTitle}">
        ${item.session
          ? html`
              <a href="${path}sessions/${item.fileSlug}">${item.title}</a>
            `
          : item.title}
      </h1>
      <rel-time class="${styles.relTime}" time="${item.start}"></rel-time>
    </div>
  `;
}

function update() {
  const now = getNow();

  const currentIndex = getCurrentScheduleIndex(now);
  const nowItem = schedule[currentIndex] || {
    title: 'Getting everything ready…',
  };
  const nextItem = schedule
    .slice(currentIndex + 1)
    .find(item => item.livestreamed);

  onNowEl.innerHTML = updateOnNow(nowItem);
  upNextEl.innerHTML = updateOnNext(nextItem);

  if (!schedule[currentIndex + 1]) return;
  setTimeout(() => update(), schedule[currentIndex + 1].start - now);
}

(() => {
  if (!self.showNowNext) return;
  livestreamEl.innerHTML = `<iframe class="${utilsStyles.mediaFill}" src="https://www.youtube.com/embed/XZcmtqL4JPI" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  update();
  rootEl.style.visibility = 'visible';
})();
