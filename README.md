# [Is the World Your Oyster?](https://xuanx1.github.io/worldOyster/animated-flight-map.html) 🗺️✈️
An animated journey map visualising my travel history and its environmental impact. [**Preview**](https://xuanx1.github.io/worldOyster/animated-flight-map.html)

https://github.com/user-attachments/assets/097a7900-2ade-423a-a1e4-bb3e0098fff5

<img width="7780" height="919" alt="screencapture-xuanx1-github-io-worldOyster-animated-flight-map-html-2026-06-21-20_08_01" src="https://github.com/user-attachments/assets/859284cf-aeab-49e3-8dfe-0ce437472efe" />

---

### 🌐 Multilingual Support
- Full i18n across all widgets and UI — **English, Arabic, Chinese, French, Russian, Spanish**

### 🌗 Light & Dark Mode
- **Light mode by default**, with a LIGHT/DARK toggle in the playbar — the choice is remembered between visits
- **Crossfaded switch**: Panels, chrome and the globe tween between palettes rather than cutting
- **Full-depth theming**: Not just the page — the globe's ocean/land/coastlines, city pins, route arcs, conceptual overlays (Asia–Europe divide, Great Wall), Leaflet basemaps, Chart.js grids and the trophy panel all repaint
- **Marks vs. text are tuned separately**: Text tones are cut for contrast on white, while canvas pins keep a vivid mid-tone — a 2px dot is read by hue against pale ocean, not by legibility
- **Respects `prefers-reduced-motion`**: Background motion holds a still frame

### ✨ Animated Backdrop
- **Flowing colour field**: A WebGL shader samples 3D simplex noise across the viewport and maps it to a drifting hue, with a fine grain and a soft falloff
- **Pointer parallax**: The field shifts with the cursor, eased rather than snapped
- **Cheap by design**: Renders at half resolution (the field is too soft to tell) and idles entirely while the tab is hidden

### 🎮 Interactive Timeline Controls
- **Video-like scrubber**: Drag the glowing timeline head to jump to any point in the journey
- **Play/Pause controls**: Start, stop, and resume animation with smooth transitions
- **Speed selector**: Cycle through 1×, 10×, 20×, and 100× playback speeds
- **Manual replay**: When the journey completes, the REPLAY button surfaces — no forced auto-loop
- **Progress bar**: Click anywhere on the bar to jump to that city

### 🌍 Dynamic Map Visualisation
- **Animated dot**: A moving marker traces the route in real-time
- **Continuous path lines**: Green gradient polylines draw the traveled route
- **Seamless world wrap**: Pan continuously across the antimeridian without seams
- **Flight route toggle**: Show/hide all route lines with a single button — route-hover popups also disable when routes are hidden
- **Follow-dot toggle**: Camera can lock onto or release from the moving marker
- **Interactive city markers**: Cities appear on arrival with hover tooltips
- **Route hover popups**: Hover any route segment to see origin, destination, mode, cost, and duration
- **Pinned popups**: Click/tap a route to pin its popup persistently
- **Reset view**: Return the map to its default position
- **Null Island marker**: A pulsing crosshair at 0°N 0°E — where the Equator crosses the Prime Meridian, and where every broken geocode lands. Hover it for a readout
- **Continental divide**: The Asia–Europe line lights amber on hover, labels included

### 🏙️ City List
- **Live city grid**: Visited, current, and upcoming cities shown in a scrollable grid
- **Numbered badges**: Each city shows its visit order
- **Native names**: Each city displays its local-language name (e.g. 東京, කොළඹ / කொழும்பு, กรุงเทพมหานคร)
- **Country labels**: Every city entry shows its country
- **Status indicators**: Green = visited, Gold = current (with pulse animation), Grey = upcoming. In light mode the badges invert to outlined buttons — green numeral on white, filling green with a white numeral for the current city

### 📊 Travel Statistics (live, with animated counters)
| Stat | Detail |
|------|--------|
| Total Journeys | Number of individual legs completed |
| Cities Visited | Unique cities reached (country-deduplicated) |
| Total Distance | Kilometres traveled, with Moon/Earth circumference metaphors |
| Total Time | Hours in transit |
| CO₂ Emission | kg / tonnes with tiered real-world comparisons |
| Cost (USD) | Summed leg-by-leg at each leg's historical SGD/USD rate (no flat-rate distortion of pre-2025 spend) |
| Cost (SGD) | Base currency total |
| Current Journey | Active leg highlighted in gold |

- **Increment animations**: Each stat shows a +delta badge when it updates
- **CO₂ comparisons**: Tiered contextual metaphors — laptop production, motorcycle emissions, global per-capita average, annual car emissions, household emissions, small-town emissions
- **Distance metaphors**: "To the Moon" (384,400 km) and "Around Earth" (40,075 km) comparisons
- **Scrolling ticker tape**: Auto-rotating travel facts and statistics
- **Data export**: Export full journey data as JSON

### 💱 Cost & Exchange Rate Adjustment
- **CPI-based inflation adjustment**: All costs adjusted to 2025 SGD using Singapore CPI data
- **Historical SGD/USD exchange rates (2017–2026)**: Every leg is converted to USD at the SGD/USD rate of its own year, then summed. The grand USD total reflects what was actually paid in USD terms at the time — not today's rate applied to a decade of spend
- **Dual price chart**: Nominal vs. real (inflation-adjusted) cost per leg

### 📈 Charts
- **Price chart**: Nominal and inflation-adjusted S$ cost over time
- **Leg efficiency chart**: Cost efficiency per journey leg
- **Period filters**: ALL, 1Y, 3Y, 5Y, 7Y, 10Y
- **Scrollable chart preview** with thumb slider
- **Spending Heatmap** — monthly spending by year
- **Cost Choropleth** — world map coloured by total spend per country
- **Duration Trend** — avg/total trip duration over time
- **Records Cards** — personal travel records (longest flight, farthest city, etc.)
- **Unvisited Neighbours** — bordering countries of visited nations, with flag icons and trophy indicators
- **Return Visits** — cities arrived at more than once. Counted by arrival only: the itinerary is one continuous chain, so scoring both endpoints of every leg would count each stop twice (once arriving, again on leaving)
- **Longest Stays** — cities with the most days spent
- **Top Airlines** — most-flown carriers
- **Journey Timeline** — continent-coloured timeline of every leg

### 🏆 Country Trophy System
- PlayStation-style tiered achievements — Bronze, Silver, Gold, Platinum
- Milestone awards: city counts, continent coverage, multi-year travel, ASEAN/EU/Superpower sets
- Special location awards for notable places
- Achievement panel with earned/locked badges & progress
- **Unrecognised territories**: Flags and data for Abkhazia, Artsakh, Somaliland, South Ossetia, Transnistria, TRNC

### 🏁 Final Boss Level — *Journey to Live III*
- **Toggleable mode**: J2L III button swaps the entire dataset for the Trans-Siberian expedition — cities, chart data, statistics all reflect the FBL trip
- **State preservation**: Toggling between Oyster ↔ J2L III pauses the mode that's not showing and resumes it from the same position on re-entry
- **Trans-Siberian Railway** rendered from real OSM railway geometry (Moscow-Yaroslavskaya → Vladivostok, sourced from the OSM "Rossiya" 002Э relation)
- **Trans-Mongolian detour**: Route dips south through Ulaanbaatar before returning to the mainline
- **Progressive route reveal**: Trans-Sib line stays in neutral grey ahead of the arrow and lights up amber only as the animation traverses it
- **Widgets hidden**: The bottom widget panel is hidden in FBL mode to keep the screen focused on the expedition
- **Live day counter**: Header replaces the year with `RUSSIA · DAY N/Total` and updates as the arrow reaches each city
- **Custom hover tooltips** with curated descriptions for every station stop

### 🌿 Environmental Impact Tracking
- **Mode-specific emission factors**:
  - ✈️ Flights: 0.25 kg CO₂/km
  - ⛴️ Ferries: 0.15 kg CO₂/km
  - 🚗 Cars: 0.12 kg CO₂/km
  - 🏍️ Motorcycles: 0.09 kg CO₂/km
  - 🚌 Buses: 0.08 kg CO₂/km
  - 🚂 Trains: 0.04 kg CO₂/km
  - 🚇 Metro/Tram: 0.03 kg CO₂/km
  - 🛴 Scooters: 0.02 kg CO₂/km
  - 🚶 Walking: 0.01 kg CO₂/km
  - 🚲 Cycling: 0.02 kg CO₂/km
- **Real-time scrubbing**: Emissions recalculate instantly as you drag the timeline

### ⏱️ Route-Aware Duration Estimation
- No hardcoded "all trains run at 100 km/h" — the calculator picks a realistic speed from route context
  - **Top-tier HSR** (Japan Shinkansen, PR China CRH/CR400, Taiwan HSR, ROK KTX, France TGV, Spain AVE): ~250 km/h effective
  - **Standard HSR** (Frecciarossa, ICE, Al Boraq, YHT, Whoosh, Afrosiyob): ~180 km/h effective
  - **Mid-speed express** (USA Acela, Russia Sapsan, Nordics X2000, Portugal Alfa Pendular, Poland Pendolino, India Vande Bharat): ~130 km/h
  - **Trans-Siberian** stops auto-detected → 55 km/h (matches real Rossiya schedule)
- Optional `duration_hours` CSV column overrides the estimate for edge cases

---

Built with ❤️ for travel
