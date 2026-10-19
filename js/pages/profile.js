import { loadTrips } from '../data.js';
import { getDraft, clearDraft } from '../recorder.js';
import { storageInfo, requestPersistence, clearAllData } from '../db.js';
import { formatBytes } from '../media.js';
import { durationHuman } from '../geo.js';
import { icon } from '../icons.js';
import { escapeHTML, toast, openSheet, confirmSheet } from '../ui.js';
import { isStandalone, isIOS, isAndroid, isSecure, canPromptInstall, promptInstall } from '../pwa.js';

export async function renderProfile(root, ctx) {
  const trips = await loadTrips();
  const totalDistance = trips.reduce((sum, trip) => sum + (trip.stats?.distance || 0), 0);
  const totalDuration = trips.reduce((sum, trip) => sum + (trip.stats?.duration || 0), 0);
  const totalMoments = trips.reduce((sum, trip) => sum + (trip.moments?.length || 0), 0);
  const storage = await storageInfo();
  const draft = getDraft();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const standalone = isStandalone();
  const secure = isSecure();

  root.innerHTML = `<div class="screen profile-screen">
    <header class="profile-top">
      <div>
        <p class="eyebrow">MY JOURNEY, MY MEMORY</p>
        <h1>我的迹忆</h1>
      </div>
      <a class="icon-button" href="#/" aria-label="返回首页">${icon('home', 19)}</a>
    </header>

    <section class="profile-card">
      <div class="profile-card__avatar">旅</div>
      <div class="profile-card__text">
        <h2>山野旅人</h2>
        <p>走过的每一步，都算数。</p>
      </div>
      <span class="profile-card__seal">${icon('footprints', 23)}</span>
    </section>

    <section class="profile-stats">
      <div><strong>${(totalDistance / 1000).toFixed(1)}</strong><span>累计公里</span></div>
      <div><strong>${escapeHTML(durationHuman(totalDuration))}</strong><span>在路上</span></div>
      <div><strong>${trips.length}</strong><span>段旅程</span></div>
      <div><strong>${totalMoments}</strong><span>个瞬间</span></div>
    </section>

    <section class="install-card ${standalone ? 'is-installed' : ''}">
      <span class="install-card__icon">${icon('download', 20)}</span>
      <div class="install-card__text">
        <strong>${standalone ? '正在以 App 模式运行' : '安装到手机'}</strong>
        <small>${standalone
          ? '从桌面启动，和网页使用同一份本地数据'
          : secure
            ? '像 App 一样从桌面打开，支持离线浏览'
            : '当前 HTTP 地址不能安装，请先用 HTTPS 打开'}</small>
      </div>
      <button class="install-card__button" type="button" data-install ${standalone ? 'disabled' : ''}>
        ${standalone ? '已安装' : secure ? '安装' : '如何安装'}
      </button>
    </section>

    ${draft ? `<button class="profile-draft" type="button" data-resume>
      <span class="profile-draft__icon">${icon('footprints', 19)}</span>
      <span><strong>有一段旅程还没走完</strong><small>${draft.points.length} 个轨迹点正在等你</small></span>
      ${icon('arrowRight', 17)}
    </button>` : ''}

    <section class="settings-group">
      <p class="settings-group__title">旅程</p>
      <a class="settings-row" href="#/">
        <span class="settings-row__icon">${icon('route', 18)}</span>
        <span class="settings-row__text"><strong>旅程首页</strong><small>${trips.length} 段记录</small></span>
        ${icon('chevron', 17)}
      </a>
      <button class="settings-row" type="button" data-guide>
        <span class="settings-row__icon">${icon('footprints', 18)}</span>
        <span class="settings-row__text"><strong>怎么使用迹忆</strong><small>记录、打卡与生成 Vlog</small></span>
        ${icon('chevron', 17)}
      </button>
    </section>

    <section class="settings-group">
      <p class="settings-group__title">数据与隐私</p>
      <div class="storage-card">
        <div class="storage-card__head">
          <span>${icon('lock', 16)} 本地存储</span>
          <span>${storage ? `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : '当前会话'}</span>
        </div>
        <div class="storage-bar"><span style="width:${storage ? Math.min(100, Math.max(1, (storage.usage / storage.quota) * 100)) : 2}%"></span></div>
        <p>${persisted ? '浏览器已允许持久保存，数据不易被自动清理。' : '轨迹、照片和视频只保存在本机；清理浏览器数据会同时删除它们。'}</p>
        ${!persisted && navigator.storage?.persist ? '<button class="text-link" type="button" data-persist>申请持久保存</button>' : ''}
      </div>
      <button class="settings-row" type="button" data-privacy>
        <span class="settings-row__icon">${icon('info', 18)}</span>
        <span class="settings-row__text"><strong>定位与隐私说明</strong><small>我们如何对待你的位置</small></span>
        ${icon('chevron', 17)}
      </button>
      <button class="settings-row settings-row--danger" type="button" data-clear>
        <span class="settings-row__icon">${icon('trash', 18)}</span>
        <span class="settings-row__text"><strong>清除全部本地数据</strong><small>旅程、照片与导出的视频</small></span>
        ${icon('chevron', 17)}
      </button>
    </section>

    <footer class="profile-foot">
      <span class="profile-foot__mark">${icon('route', 18)}</span>
      <p>迹忆 · TRAIL MEMOIR</p>
      <small>v1.0.0 · 为每一步留下回声</small>
    </footer>

    <nav class="tabbar" aria-label="主导航">
      <a class="tabbar__item" href="#/">
        <span class="tabbar__icon">${icon('home', 21)}</span><span>首页</span>
      </a>
      <button class="tabbar__record" type="button" data-start-record>
        <span class="tabbar__record-inner">${icon('footprints', 25)}</span>
        <span class="tabbar__record-label">记录</span>
      </button>
      <a class="tabbar__item is-active" href="#/profile">
        <span class="tabbar__icon">${icon('user', 21)}</span><span>我的</span>
      </a>
    </nav>
  </div>`;

  root.querySelector('[data-start-record]')?.addEventListener('click', () => ctx.navigate('/record'));
  root.querySelector('[data-resume]')?.addEventListener('click', () => {
    sessionStorage.setItem('jiyi:resume-draft', '1');
    ctx.navigate('/record');
  });

  function openInstallGuide() {
    if (!secure) {
      openSheet({
        title: '先用 HTTPS 打开',
        subtitle: location.origin,
        content: `<div class="install-help">
          <div class="install-help__warning">${icon('lock', 15)} 当前是 HTTP 局域网地址，浏览器不允许安装 PWA，也不允许定位。</div>
          <p>把项目根目录的 <code>jiyi-static.zip</code> 拖到 Netlify Drop，或在 Vercel / GitHub Pages 部署，得到一个 HTTPS 地址，再用手机打开。</p>
          <p>HTTPS 地址打开后，浏览器菜单里才会出现「安装应用 / 添加到主屏幕」。</p>
        </div>`,
      });
      return;
    }
    openSheet({
      title: '安装到手机',
      subtitle: isIOS() ? 'iPhone / iPad · Safari' : isAndroid() ? 'Android · Chrome' : 'Chrome / Edge',
      content: `<div class="install-help">
        ${isIOS() ? `<h3>iPhone / iPad</h3>
          <ol>
            <li>请用 <strong>Safari</strong> 打开本页（微信内置浏览器不行）。</li>
            <li>点击底部的「分享」按钮。</li>
            <li>向下找到「添加到主屏幕」，确认添加。</li>
          </ol>
          <p class="install-help__note">iOS 没有直接安装 APK 的方式；添加到主屏幕后，它会以全屏 App 方式运行。上架 App Store 需要 Apple 开发者账号。</p>`
          : isAndroid() ? `<h3>Android</h3>
          <ol>
            <li>请用 <strong>Chrome</strong> 打开本页。</li>
            <li>点右上角「⋮」菜单。</li>
            <li>选择「安装应用」或「添加到主屏幕」。</li>
            <li>确认安装，之后可以从桌面直接打开。</li>
          </ol>
          <p class="install-help__note">如果没有看到安装入口，刷新页面等几秒，或确认当前是 HTTPS 地址。需要可分发 APK 时，可把部署后的 HTTPS 地址交给 PWABuilder 生成 Android 安装包。</p>`
          : `<h3>桌面 Chrome / Edge</h3>
          <ol>
            <li>点击地址栏右侧的安装图标。</li>
            <li>选择「安装」。</li>
          </ol>`}
        <p class="install-help__foot">${icon('info', 12)} 安装的是同一个 PWA，轨迹和照片仍保存在本机浏览器中。</p>
      </div>`,
    });
  }

  root.querySelector('[data-install]')?.addEventListener('click', async () => {
    if (standalone) {
      toast('已经在 App 模式中运行');
      return;
    }
    if (!secure) {
      openInstallGuide();
      return;
    }
    if (!canPromptInstall()) {
      openInstallGuide();
      return;
    }
    const result = await promptInstall();
    if (result === 'accepted') toast('正在安装迹忆', { type: 'success' });
    else if (result === 'dismissed') toast('已取消安装');
    else openInstallGuide();
  });

  root.querySelector('[data-persist]')?.addEventListener('click', async () => {
    const ok = await requestPersistence();
    toast(ok ? '已开启持久保存' : '浏览器暂时没有允许，可稍后再试', { type: ok ? 'success' : 'default' });
  });

  root.querySelector('[data-guide]')?.addEventListener('click', () => {
    openSheet({
      title: '怎么使用迹忆',
      subtitle: '三步，把一段路变成一支片子',
      content: `<ol class="guide-list">
        <li><span>01</span><div><strong>开始记录</strong><p>在首页点「开始记录」。允许定位后，迹忆会在地图上画出你的路线。</p></div></li>
        <li><span>02</span><div><strong>留下沿途瞬间</strong><p>到达喜欢的地方，点「照片」拍一张，或点「此刻」写几句心情。记录会自动落在此刻的位置。</p></div></li>
        <li><span>03</span><div><strong>生成运动 Vlog</strong><p>结束后打开旅程，点「生成运动 Vlog」。选一个色调，轨迹会带着照片与文字，剪成 9:16 竖屏视频。</p></div></li>
      </ol>
      <p class="guide-tip">${icon('lock', 13)} 建议在 HTTPS 页面或本机 localhost 中使用定位；微信内置浏览器可能限制视频导出，如遇问题请用系统浏览器打开。</p>`,
    });
  });

  root.querySelector('[data-privacy]')?.addEventListener('click', () => {
    openSheet({
      title: '定位与隐私',
      content: `<div class="privacy-copy">
        <p><strong>位置只在本机处理。</strong>迹忆没有服务器，也不会把轨迹、照片、文字或视频上传到任何地方。</p>
        <p><strong>定位权限只用于记录。</strong>开始记录时浏览器会请求位置权限；结束记录后可以随时在系统设置里收回。</p>
        <p><strong>照片与视频保存在浏览器数据库。</strong>它们不会被压缩后上传。清理浏览器站点数据、卸载浏览器或更换设备都会导致记录丢失。</p>
        <p><strong>视频在本机合成。</strong>导出时浏览器使用 Canvas 绘制每一帧，再用 MediaRecorder 编码，整个过程不经过网络。</p>
      </div>`,
    });
  });

  root.querySelector('[data-clear]')?.addEventListener('click', async () => {
    const yes = await confirmSheet({
      title: '清除全部本地数据？',
      message: '所有旅程、轨迹、照片、文字和导出的视频都会被永久删除。这个操作无法撤销。',
      confirmText: '全部清除',
      cancelText: '保留数据',
      danger: true,
    });
    if (!yes) return;
    await clearAllData();
    clearDraft();
    toast('本地数据已清除');
    setTimeout(() => {
      location.hash = '#/';
      location.reload();
    }, 500);
  });

  return { destroy() {} };
}
