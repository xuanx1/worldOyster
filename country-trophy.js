// Country Trophy Notification — PlayStation-style trophy popup when a new country is visited
(function () {
    'use strict';

    const seenCountries = new Set();
    let trophyQueue = [];
    let isShowing = false;

    // Create the trophy container (fixed position, bottom-left like PS trophies)
    const container = document.createElement('div');
    container.id = 'trophy-container';
    container.innerHTML = '';
    document.body.appendChild(container);

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        #trophy-container {
            position: fixed;
            bottom: 32px;
            left: 32px;
            z-index: 100000;
            pointer-events: none;
        }

        .trophy-notification {
            display: flex;
            align-items: center;
            gap: 12px;
            background: linear-gradient(180deg, rgba(44,44,44,0.98), rgba(32,32,32,0.98));
            border: 1px solid rgba(255,255,255,0.04);
            border-radius: 8px;
            padding: 12px 18px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            min-width: 240px;
            max-width: 360px;
            opacity: 0;
            transform: translateX(-40px);
            transition: opacity 0.4s ease, transform 0.4s ease;
            pointer-events: auto;
            margin-top: 10px;
        }

        .trophy-notification.show {
            opacity: 1;
            transform: translateX(0);
        }

        .trophy-notification.hide {
            opacity: 0;
            transform: translateX(-40px);
        }

        .trophy-icon {
            flex-shrink: 0;
            width: 38px;
            height: 38px;
            border-radius: 6px;
            background: rgba(76, 175, 80, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .trophy-icon svg {
            width: 22px;
            height: 22px;
        }

        .trophy-body {
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;
        }

        .trophy-label {
            font-size: 0.55em;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: #999;
            font-weight: 500;
        }

        .trophy-country {
            font-weight: 600;
            font-size: 1.1em;
            color: #4CAF50;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .trophy-count {
            font-size: 0.6em;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: #fff;
            margin-top: 1px;
        }

        @media (max-width: 768px) {
            #trophy-container {
                bottom: 16px;
                left: 16px;
                right: 16px;
            }
            .trophy-notification {
                min-width: unset;
                max-width: unset;
                width: 100%;
                padding: 10px 14px;
            }
        }
    `;
    document.head.appendChild(style);

    // Checkmark SVG
    const checkSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
    </svg>`;

    function showNext() {
        if (trophyQueue.length === 0) {
            isShowing = false;
            return;
        }
        isShowing = true;
        const { country, count } = trophyQueue.shift();

        const el = document.createElement('div');
        el.className = 'trophy-notification';
        el.innerHTML = `
            <div class="trophy-icon">${checkSVG}</div>
            <div class="trophy-body">
                <div class="trophy-label">New Country Unlocked</div>
                <div class="trophy-country">${country}</div>
                <div class="trophy-count">Country #${count}</div>
            </div>
        `;
        container.appendChild(el);

        // Trigger slide-in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add('show');
            });
        });

        // Hold, then slide out and remove
        setTimeout(() => {
            el.classList.remove('show');
            el.classList.add('hide');
            setTimeout(() => {
                el.remove();
                showNext();
            }, 400);
        }, 2600);
    }

    function queueTrophy(country) {
        const count = seenCountries.size;
        trophyQueue.push({ country, count });
        if (!isShowing) showNext();
    }

    // Hook: called each time a city becomes the current destination
    function checkCity(city) {
        if (!city || !city.country) return;
        const country = city.country.trim();
        if (!country || country === 'Unknown') return;
        if (seenCountries.has(country)) return;
        seenCountries.add(country);
        queueTrophy(country);
    }

    // Reset state (e.g. when animation restarts)
    function reset() {
        seenCountries.clear();
        trophyQueue = [];
        isShowing = false;
        container.innerHTML = '';
    }

    // Silently sync seen countries up to a list of cities (no popups) — used when scrubbing
    function syncTo(cities) {
        reset();
        if (!cities) return;
        cities.forEach(city => {
            if (city && city.country) {
                const country = city.country.trim();
                if (country && country !== 'Unknown') seenCountries.add(country);
            }
        });
    }

    // Expose globally so animated-flight-map.js can call these
    window.countryTrophy = { checkCity, reset, syncTo };
})();
