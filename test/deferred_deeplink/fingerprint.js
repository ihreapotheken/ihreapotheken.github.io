/**
 * Browser-side device fingerprint collector.
 *
 * Collects the same signals as the native iOS DeviceInfoCollector
 * using browser APIs so that the backend can match web visitors
 * to app installs for deferred deep linking.
 */
const DeviceFingerprint = (() => {
  'use strict';

  /**
   * Collects all available fingerprint signals.
   * @returns {Promise<Object>} The collected fingerprint data.
   */
  async function collect() {
    const info = {};

    // -- Device / User-Agent --
    info.userAgent = navigator.userAgent;
    info.platform = navigator.platform;
    info.vendor = navigator.vendor || '';

    // -- Screen --
    info.devicePixelRatio = window.devicePixelRatio;
    info.screenWidth = screen.width;
    info.screenHeight = screen.height;
    info.screenAvailWidth = screen.availWidth;
    info.screenAvailHeight = screen.availHeight;
    info.screenWidthPx = Math.round(screen.width * window.devicePixelRatio);
    info.screenHeightPx = Math.round(screen.height * window.devicePixelRatio);
    info.screenColorDepth = screen.colorDepth;

    // -- Locale / Language --
    info.language = navigator.language;
    info.languages = navigator.languages ? Array.from(navigator.languages) : [navigator.language];
    info.languageCode = navigator.language.split('-')[0];
    info.regionCode = navigator.language.includes('-')
      ? navigator.language.split('-').slice(1).join('-')
      : '';

    // -- Timezone --
    const resolvedTz = Intl.DateTimeFormat().resolvedOptions();
    info.timezoneIdentifier = resolvedTz.timeZone;
    info.timezoneOffsetSeconds = new Date().getTimezoneOffset() * -60;
    info.timezoneAbbreviation = _getTimezoneAbbreviation();

    // -- Timestamps (comparable to iOS deviceTimestampUTC / deviceTimestampEpochMs) --
    const now = new Date();
    info.deviceTimestampUTC = now.toISOString();
    info.deviceTimestampEpochMs = Date.now();
    info.deviceLocalTimestamp = _toLocalISOString(now);

    // -- Locale formatting (comparable to iOS decimalSeparator, groupingSeparator, etc.) --
    info.decimalSeparator = _getDecimalSeparator();
    info.groupingSeparator = _getGroupingSeparator();
    const currencyInfo = _getCurrencyInfo();
    info.currencyCode = currencyInfo.code;
    info.currencySymbol = currencyInfo.symbol;

    // -- Calendar (comparable to iOS calendarIdentifier / firstWeekday) --
    info.calendarIdentifier = resolvedTz.calendar || 'gregory';
    info.firstWeekday = _getFirstWeekday();

    // -- Time format (comparable to iOS uses24HourTime) --
    info.uses24HourTime = _uses24HourTime();

    // -- Metric system (comparable to iOS usesMetricSystem) --
    info.usesMetricSystem = _usesMetricSystem();

    // -- Dark/light mode (comparable to iOS userInterfaceStyle) --
    info.userInterfaceStyle = _getColorScheme();

    // -- Font size / text scale (comparable to iOS contentSizeCategory) --
    info.baseFontSize = _getBaseFontSize();

    // -- Device orientation (comparable to iOS deviceOrientation) --
    info.deviceOrientation = _getOrientation();

    // -- Network type (comparable to iOS currentRadioAccessTechnology) --
    const netInfo = _getNetworkInfo();
    info.connectionEffectiveType = netInfo.effectiveType;
    info.connectionDownlink = netInfo.downlink;
    info.connectionRtt = netInfo.rtt;

    // -- Hardware --
    info.hardwareConcurrency = navigator.hardwareConcurrency || null;
    info.deviceMemoryGB = navigator.deviceMemory || null;

    // -- Battery (async, comparable to iOS batteryLevel / batteryState) --
    const battery = await _getBatteryInfo();
    info.batteryLevel = battery.level;
    info.batteryCharging = battery.charging;

    // -- Storage estimate (comparable to iOS disk space) --
    const storage = await _getStorageEstimate();
    info.storageQuotaBytes = storage.quota;
    info.storageUsageBytes = storage.usage;

    // -- Touch support (helps distinguish phone/tablet/desktop) --
    info.maxTouchPoints = navigator.maxTouchPoints || 0;
    info.touchSupport = 'ontouchstart' in window;

    // -- Do Not Track --
    info.doNotTrack = navigator.doNotTrack || window.doNotTrack || null;

    // -- Cookie enabled --
    info.cookieEnabled = navigator.cookieEnabled;

    // -- PDF viewer --
    info.pdfViewerEnabled = navigator.pdfViewerEnabled != null ? navigator.pdfViewerEnabled : null;

    // -- WebGL renderer (GPU fingerprint) --
    info.webglRenderer = _getWebGLRenderer();

    // -- Canvas fingerprint hash --
    info.canvasHash = _getCanvasHash();

    // -- Audio context fingerprint --
    info.audioContextHash = await _getAudioFingerprint();

    // -- Viewport dimensions --
    info.viewportWidth = window.innerWidth;
    info.viewportHeight = window.innerHeight;
    info.outerWidth = window.outerWidth;
    info.outerHeight = window.outerHeight;

    // -- Pixel depth --
    info.pixelDepth = screen.pixelDepth;

    // -- WebDriver (automation detection) --
    info.webdriver = navigator.webdriver || false;

    // -- Plugins count --
    info.pluginsCount = navigator.plugins ? navigator.plugins.length : 0;
    info.mimeTypesCount = navigator.mimeTypes ? navigator.mimeTypes.length : 0;

    // -- Accessibility / reduced motion --
    info.prefersReducedMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : null;
    info.prefersContrast = _getPrefersContrast();
    info.forcedColors = window.matchMedia
      ? window.matchMedia('(forced-colors: active)').matches
      : null;

    // -- Available locales count (Intl) --
    info.availableLocalesCount = _getAvailableLocalesCount();

    // -- Performance timing --
    info.performanceNow = performance.now();

    // -- Math constants fingerprint (engine-specific) --
    info.mathFingerprint = _getMathFingerprint();

    // -- Installed fonts (probe-based) --
    info.installedFontsHash = _getInstalledFontsHash();

    return info;
  }

  /**
   * Collects fingerprint and returns as a JSON string.
   * @returns {Promise<string>}
   */
  async function collectAsJson() {
    const info = await collect();
    return JSON.stringify(info);
  }

  /**
   * Collects fingerprint and sends it to the given endpoint via POST.
   * @param {string} endpoint - The URL to send fingerprint data to.
   * @param {Object} [options] - Optional fetch options.
   * @param {number} [options.timeout=10000] - Request timeout in ms.
   * @returns {Promise<string|null>} The deeplink URL or null.
   */
  async function resolve(endpoint, options = {}) {
    const timeout = options.timeout || 10000;

    try {
      const info = await collect();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(info),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        return data.deeplink || null;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  function _getTimezoneAbbreviation() {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(new Date());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return tzPart ? tzPart.value : '';
    } catch (_) {
      return '';
    }
  }

  function _toLocalISOString(date) {
    const off = date.getTimezoneOffset();
    const sign = off <= 0 ? '+' : '-';
    const absOff = Math.abs(off);
    const hh = String(Math.floor(absOff / 60)).padStart(2, '0');
    const mm = String(absOff % 60).padStart(2, '0');
    const local = new Date(date.getTime() - off * 60000);
    return local.toISOString().replace('Z', `${sign}${hh}:${mm}`);
  }

  function _getDecimalSeparator() {
    try {
      const parts = new Intl.NumberFormat().formatToParts(1.1);
      const dec = parts.find(p => p.type === 'decimal');
      return dec ? dec.value : '.';
    } catch (_) {
      return '.';
    }
  }

  function _getGroupingSeparator() {
    try {
      const parts = new Intl.NumberFormat().formatToParts(10000);
      const grp = parts.find(p => p.type === 'group');
      return grp ? grp.value : ',';
    } catch (_) {
      return ',';
    }
  }

  function _getCurrencyInfo() {
    try {
      const opts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
      }).resolvedOptions();
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: opts.currency,
      }).formatToParts(0);
      const sym = parts.find(p => p.type === 'currency');
      return {
        code: opts.currency || '',
        symbol: sym ? sym.value : '',
      };
    } catch (_) {
      return { code: '', symbol: '' };
    }
  }

  function _getFirstWeekday() {
    try {
      // Intl.Locale.prototype.weekInfo is available in modern browsers
      const locale = new Intl.Locale(navigator.language);
      if (locale.weekInfo) {
        return locale.weekInfo.firstDay; // 1=Monday, 7=Sunday
      }
      if (locale.getWeekInfo) {
        return locale.getWeekInfo().firstDay;
      }
    } catch (_) {}
    return null;
  }

  function _uses24HourTime() {
    try {
      const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
      return opts.hourCycle === 'h23' || opts.hourCycle === 'h24';
    } catch (_) {
      return null;
    }
  }

  function _usesMetricSystem() {
    // Regions that use imperial: US, LR, MM
    const region = (navigator.language.split('-')[1] || '').toUpperCase();
    const imperialRegions = ['US', 'LR', 'MM'];
    if (region) {
      return !imperialRegions.includes(region);
    }
    return null; // Unknown
  }

  function _getColorScheme() {
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    return 'unspecified';
  }

  function _getBaseFontSize() {
    try {
      return parseFloat(getComputedStyle(document.documentElement).fontSize);
    } catch (_) {
      return null;
    }
  }

  function _getOrientation() {
    if (screen.orientation) {
      return screen.orientation.type; // e.g. "portrait-primary"
    }
    if (typeof window.orientation !== 'undefined') {
      return window.orientation === 0 || window.orientation === 180
        ? 'portrait'
        : 'landscape';
    }
    return 'unknown';
  }

  function _getNetworkInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      return {
        effectiveType: conn.effectiveType || null,
        downlink: conn.downlink != null ? conn.downlink : null,
        rtt: conn.rtt != null ? conn.rtt : null,
      };
    }
    return { effectiveType: null, downlink: null, rtt: null };
  }

  async function _getBatteryInfo() {
    try {
      if (navigator.getBattery) {
        const batt = await navigator.getBattery();
        return {
          level: batt.level,
          charging: batt.charging,
        };
      }
    } catch (_) {}
    return { level: null, charging: null };
  }

  async function _getStorageEstimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        return {
          quota: est.quota || null,
          usage: est.usage || null,
        };
      }
    } catch (_) {}
    return { quota: null, usage: null };
  }

  function _getWebGLRenderer() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch (_) {}
    return null;
  }

  function _getCanvasHash() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('fingerprint', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('fingerprint', 4, 17);

      const dataUrl = canvas.toDataURL();
      // Simple hash of the data URL
      let hash = 0;
      for (let i = 0; i < dataUrl.length; i++) {
        const char = dataUrl.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
      }
      return hash;
    } catch (_) {
      return null;
    }
  }

  async function _getAudioFingerprint() {
    try {
      const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, ctx.currentTime);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, ctx.currentTime);
      compressor.knee.setValueAtTime(40, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);
      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);
      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);
      let hash = 0;
      for (let i = 4500; i < 5000; i++) {
        hash = ((hash << 5) - hash) + Math.round(data[i] * 1000000);
        hash |= 0;
      }
      return hash;
    } catch (_) {
      return null;
    }
  }

  function _getPrefersContrast() {
    if (!window.matchMedia) return null;
    if (window.matchMedia('(prefers-contrast: more)').matches) return 'more';
    if (window.matchMedia('(prefers-contrast: less)').matches) return 'less';
    if (window.matchMedia('(prefers-contrast: custom)').matches) return 'custom';
    return 'no-preference';
  }

  function _getAvailableLocalesCount() {
    try {
      if (Intl.Segmenter && Intl.Segmenter.supportedLocalesOf) {
        return null; // Can't enumerate, return null
      }
    } catch (_) {}
    return null;
  }

  function _getMathFingerprint() {
    try {
      const values = [
        Math.acos(0.5),
        Math.acosh(1e308),
        Math.asin(0.5),
        Math.asinh(1),
        Math.atanh(0.5),
        Math.cbrt(100),
        Math.cosh(1),
        Math.expm1(1),
        Math.log1p(10),
        Math.sinh(1),
        Math.tanh(1),
      ];
      let hash = 0;
      for (const v of values) {
        const s = v.toString();
        for (let i = 0; i < s.length; i++) {
          hash = ((hash << 5) - hash) + s.charCodeAt(i);
          hash |= 0;
        }
      }
      return hash;
    } catch (_) {
      return null;
    }
  }

  function _getInstalledFontsHash() {
    try {
      const testFonts = [
        'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia',
        'Palatino', 'Garamond', 'Comic Sans MS', 'Impact', 'Lucida Console',
        'Tahoma', 'Trebuchet MS', 'Helvetica', 'Futura', 'Gill Sans',
        'Rockwell', 'Optima', 'Baskerville', 'Didot', 'American Typewriter',
      ];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const baseline = 'monospace';
      const testStr = 'mmmmmmmmmmlli';
      ctx.font = '72px ' + baseline;
      const baseWidth = ctx.measureText(testStr).width;

      let hash = 0;
      for (const font of testFonts) {
        ctx.font = '72px "' + font + '", ' + baseline;
        const width = ctx.measureText(testStr).width;
        if (width !== baseWidth) {
          for (let i = 0; i < font.length; i++) {
            hash = ((hash << 5) - hash) + font.charCodeAt(i);
            hash |= 0;
          }
        }
      }
      return hash;
    } catch (_) {
      return null;
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    collect,
    collectAsJson,
    resolve,
  };
})();
