/* ================================================================
   script.js — 7.4 生日祝福页 · 全部交互逻辑
   ================================================================ */

/* === 全局变量：读取个性化称呼 === */
var recipient = localStorage.getItem('recipientName') || '你';
var sender = localStorage.getItem('senderName') || '你的朋友';

/* === 紧急性：在所有内容渲染前替换称呼 === */
(function applyNames() {
    // 替换所有 .recipient-target 元素的文本
    document.querySelectorAll('.recipient-target').forEach(function(el) {
        el.textContent = recipient;
    });
    // 替换落款
    var sig = document.getElementById('signature');
    if (sig) sig.textContent = '—— ' + sender + ' ✨';
})();

/* === URL 参数处理：?birthday 强制触发生日模式，?reset 重置 === */
(function handleURLParams() {
    var url = new URL(window.location.href);
    if (url.searchParams.has('reset')) {
        localStorage.removeItem('birthday_triggered');
        // 清理 URL 中的 reset 参数
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', url.toString());
    }
})();

// ── Starfield Background ──
(function() {
    var canvas = document.getElementById('starsCanvas');
    var ctx = canvas.getContext('2d');
    /* === 性能优化：星星数量从 180 降至 120 === */
    var STAR_COUNT = 120;
    var stars = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        stars = [];
        for (var i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.8 + 0.4,
                twinkleSpeed: Math.random() * 0.015 + 0.005,
                twinkleOffset: Math.random() * Math.PI * 2,
                baseAlpha: Math.random() * 0.5 + 0.3
            });
        }
    }
    window.addEventListener('resize', resize);
    resize();

    function drawStars(timestamp) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            var alpha = s.baseAlpha + Math.sin(timestamp * s.twinkleSpeed + s.twinkleOffset) * 0.25;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245,210,220,' + Math.max(0.08, alpha) + ')';
            ctx.fill();
            if (alpha > 0.6) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(245,210,220,0.04)';
                ctx.fill();
            }
        }
        for (var j = 0; j < stars.length; j++) {
            stars[j].y -= 0.08;
            if (stars[j].y < -10) {
                stars[j].y = canvas.height + 10;
                stars[j].x = Math.random() * canvas.width;
            }
        }
        requestAnimationFrame(drawStars);
    }
    requestAnimationFrame(drawStars);
})();

/* === 彩纸屑全局上限 200 枚 === */
var activeConfetti = 0;
var MAX_CONFETTI = 200;

// ── Confetti ──
function launchConfetti(count) {
    count = count || 60;
    // 硬上限：不超过 200
    var available = Math.max(0, MAX_CONFETTI - activeConfetti);
    var actual = Math.min(count, available);
    if (actual <= 0) return;

    activeConfetti += actual;

    var container = document.getElementById('confettiContainer');
    var colors = ['#f5c6d0','#e8798a','#c44d70','#f0c4d0','#ffb3c6','#ffd700','#ff8fab','#cdb4db','#ffc8dd','#bde0fe'];
    var shapes = ['square','circle'];

    for (var i = 0; i < actual; i++) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.top = -(Math.random() * 30) + '%';
        var w = 5 + Math.random() * 12;
        piece.style.width = w + 'px';
        piece.style.height = (shapes[Math.floor(Math.random() * 2)] === 'square' ? w : w * 1.6) + 'px';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = (2.5 + Math.random() * 4) + 's';
        piece.style.animationDelay = Math.random() * 0.6 + 's';
        container.appendChild(piece);

        // 销毁时递减计数
        (function(p, delay) {
            setTimeout(function() {
                p.remove();
                activeConfetti = Math.max(0, activeConfetti - 1);
            }, (delay + 0.5) * 1000);
        })(piece, parseFloat(piece.style.animationDuration) + parseFloat(piece.style.animationDelay));
    }
}

// ── Spark Burst ──
function sparkAt(cx, cy) {
    var container = document.getElementById('confettiContainer');
    var colors = ['#f5c6d0','#e8798a','#ffd700','#fff','#ffb3c6','#cdb4db','#ffc8dd'];
    var count = 24;
    for (var i = 0; i < count; i++) {
        var s = document.createElement('div');
        s.className = 'spark';
        s.style.left = cx + 'px';
        s.style.top = cy + 'px';
        s.style.width = (2 + Math.random() * 6) + 'px';
        s.style.height = s.style.width;
        s.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        var angle = (Math.PI * 2 * i) / count;
        var dist = 40 + Math.random() * 80;
        s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        container.appendChild(s);
        setTimeout(function() { s.remove(); }, 1000);
    }
}

/* === 聚焦式彩纸屑：围绕指定元素为中心发射 === */
function focusedConfetti(targetEl, count) {
    count = count || 40;
    var rect = targetEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var container = document.getElementById('confettiContainer');
    var colors = ['#f5c6d0','#e8798a','#ffd700','#f0c4d0','#ffb3c6','#ff8fab','#cdb4db'];

    var available = Math.max(0, MAX_CONFETTI - activeConfetti);
    var actual = Math.min(count, available);
    if (actual <= 0) return;
    activeConfetti += actual;

    for (var i = 0; i < actual; i++) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        var offsetX = (Math.random() - 0.5) * rect.width * 1.5;
        var offsetY = (Math.random() - 0.5) * rect.height * 1.5;
        piece.style.left = (cx + offsetX) + 'px';
        piece.style.top = (cy + offsetY) + 'px';
        var w = 5 + Math.random() * 10;
        piece.style.width = w + 'px';
        piece.style.height = w * (Math.random() > 0.5 ? 1 : 1.6) + 'px';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = (1.5 + Math.random() * 2.5) + 's';
        container.appendChild(piece);

        (function(p, duration) {
            setTimeout(function() {
                p.remove();
                activeConfetti = Math.max(0, activeConfetti - 1);
            }, (duration + 0.3) * 1000);
        })(piece, parseFloat(piece.style.animationDuration));
    }

    // 附带几颗小火花
    for (var j = 0; j < 8; j++) {
        (function(_cx, _cy, delay) {
            setTimeout(function() {
                sparkAt(_cx + (Math.random() - 0.5) * 120, _cy + (Math.random() - 0.5) * 80);
            }, delay);
        })(cx, cy, j * 60);
    }
}

// ── Toast helper ──
function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2800);
}

// ── Countdown Timer ──
/* === 修复：生日到达后显示 00 天 00 时 00 分 00 秒，保持生日模式 === */
(function() {
    var BIRTHDAY = new Date('2026-07-04T00:00:00+08:00');
    var daysEl = document.getElementById('cd-days');
    var hoursEl = document.getElementById('cd-hours');
    var minsEl = document.getElementById('cd-mins');
    var secsEl = document.getElementById('cd-secs');
    var hero = document.getElementById('hero');
    var scrollHint = document.getElementById('scrollHint');
    var birthdayTriggered = localStorage.getItem('birthday_triggered') === 'true';

    /* === 检查 URL ?birthday 参数 === */
    var url = new URL(window.location.href);
    if (url.searchParams.has('birthday') && !birthdayTriggered) {
        birthdayTriggered = true;
        localStorage.setItem('birthday_triggered', 'true');
    }

    function triggerBirthday() {
        if (birthdayTriggered) return;
        birthdayTriggered = true;
        localStorage.setItem('birthday_triggered', 'true');

        hero.classList.add('birthday-mode');
        scrollHint.textContent = '🎉 生日快乐！往下看有礼物 🎉';

        function celebBurst() {
            launchConfetti(150);
            for (var i = 0; i < 12; i++) {
                (function(delay) {
                    setTimeout(function() {
                        var x = 80 + Math.random() * (window.innerWidth - 160);
                        var y = 80 + Math.random() * (window.innerHeight - 300);
                        sparkAt(x, y);
                    }, delay);
                })(i * 150);
            }
        }
        celebBurst();
        setTimeout(celebBurst, 3000);
        setTimeout(celebBurst, 6000);

        setInterval(function() {
            launchConfetti(60);
            sparkAt(80 + Math.random() * (window.innerWidth - 160), 80 + Math.random() * (window.innerHeight - 300));
        }, 30000);

        showToast('🎂 就是今天！生日快乐！！🎂');
    }

    if (birthdayTriggered) {
        hero.classList.add('birthday-mode');
        scrollHint.textContent = '🎉 生日快乐！往下看有礼物 🎉';
    }

    function update() {
        var now = new Date();
        var diff = BIRTHDAY - now;

        if (diff <= 0) {
            /* === 修复：生日到达后显示 00，而非 emoji === */
            if (!birthdayTriggered) triggerBirthday();
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minsEl.textContent = '00';
            secsEl.textContent = '00';
            return;
        }

        if (birthdayTriggered) {
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minsEl.textContent = '00';
            secsEl.textContent = '00';
            return;
        }

        var d = Math.floor(diff / 86400000); diff -= d * 86400000;
        var h = Math.floor(diff / 3600000); diff -= h * 3600000;
        var m = Math.floor(diff / 60000); diff -= m * 60000;
        var s = Math.floor(diff / 1000);

        daysEl.textContent = String(d).padStart(2, '0');
        hoursEl.textContent = String(h).padStart(2, '0');
        minsEl.textContent = String(m).padStart(2, '0');
        secsEl.textContent = String(s).padStart(2, '0');
    }
    update();
    setInterval(update, 1000);
})();

// ── Wish Card Flip + 全翻奖励 ──
(function() {
    var cards = document.querySelectorAll('.wish-card');
    var allHint = document.getElementById('allFlippedHint');
    var allFlippedTriggered = false;

    function checkAllFlipped() {
        var allFlipped = Array.prototype.every.call(cards, function(c) {
            return c.classList.contains('flipped');
        });
        if (allFlipped && !allFlippedTriggered) {
            allFlippedTriggered = true;
            launchConfetti(200);
            showToast('✨ 四份祝福已全部开启，请收下 ——');
            allHint.classList.add('visible');
        }
    }

    cards.forEach(function(card) {
        card.addEventListener('click', function() {
            card.classList.toggle('flipped');
            if (card.classList.contains('flipped')) {
                launchConfetti(25);
            }
            checkAllFlipped();
        });
    });
})();

// ── Gift Box ──
/* === 修复：单次打开，不可合上 === */
(function() {
    var box = document.getElementById('giftBox');
    var reveal = document.getElementById('watchReveal');
    var tip = document.getElementById('giftTip');
    var opened = false;

    box.addEventListener('click', function() {
        if (opened) return;
        opened = true;

        box.classList.add('open');
        launchConfetti(120);
        tip.textContent = '🎁 礼物已拆开，往下看 ↓';

        setTimeout(function() {
            reveal.classList.add('visible');
            var watchDisplay = reveal.querySelector('.watch-display');
            focusedConfetti(watchDisplay, 40);
            reveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 600);
    });
})();

// ── 流星雨彩蛋：3 秒内连续点击空白区域 5 次 ──
(function() {
    var clickTimes = [];
    var REQUIRED_CLICKS = 5;
    var TIME_WINDOW = 3000;

    document.addEventListener('click', function(e) {
        if (e.target.closest('.wish-card') ||
            e.target.closest('.gift-box') ||
            e.target.closest('.polaroid')) return;

        var now = Date.now();
        clickTimes.push(now);
        clickTimes = clickTimes.filter(function(t) { return now - t < TIME_WINDOW; });

        if (clickTimes.length >= REQUIRED_CLICKS) {
            clickTimes = [];
            triggerMeteorShower();
        }

        sparkAt(e.clientX, e.clientY);
    });

    function triggerMeteorShower() {
        showToast('🌠 流星划过，许个愿吧 ——');
        for (var i = 0; i < 30; i++) {
            (function(delay) {
                setTimeout(function() {
                    var x = 20 + Math.random() * (window.innerWidth - 40);
                    var y = 20 + Math.random() * 60;
                    sparkAt(x, y);
                }, delay);
            })(i * 80);
        }
        launchConfetti(80);
    }
})();

// ── Keyboard easter eggs ──
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        launchConfetti(60);
        showToast('✨ 彩带为你而落 ✨');
    }
});

// ── Initial entrance ──
setTimeout(function() { launchConfetti(40); }, 1800);

// ── Scroll-triggered section animations ──
(function() {
    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.2 });

    document.querySelectorAll('section').forEach(function(sec) {
        sec.style.opacity = '0';
        sec.style.transform = 'translateY(30px)';
        sec.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        observer.observe(sec);
    });

    var hero = document.querySelector('#hero');
    hero.style.opacity = '1';
    hero.style.transform = '';
})();

console.log('💝 生日快乐！');
console.log('🎂 7月4日 · 23岁 · 最好的年华');
console.log('💡 提示：在 localStorage 设置 recipientName 和 senderName 可个性化称呼');
console.log('💡 URL 加 ?birthday 预览生日模式，?reset 重置状态');
