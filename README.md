# [Is the World Your Oyster?](https://xuanx1.github.io/worldOyster/animated-flight-map.html) 🗺️✈️
An animated journey map visualizing my travel history and its environmental impact. [**Preview** ](https://xuanx1.github.io/worldOyster/animated-flight-map.html)

<img width="1290" height="2796" alt="127 0 0 1_5500_animated-flight-map html(iPhone 14 Pro Max)" src="https://github.com/user-attachments/assets/c9d5f456-c813-4c4e-9d26-a936f76b22ec" />

![Screenshot 2025-09-23 015354](https://github.com/user-attachments/assets/c54b6a5e-84de-4e5f-baf3-be1cde4c0ce9)

### 🎮 Interactive Timeline Controls
- **Video-like scrubber**: Drag the glowing timeline head to jump to any point in your journey
- **Play/Pause controls**: Start, stop, and resume animation with smooth transitions
- **Auto-loop**: Animation automatically restarts when reaching the end
- **Progress tracking**: Visual progress bar shows journey completion percentage

### 🌍 Dynamic Map Visualization
- **Animated flight paths**: Watch your journey unfold in real-time with moving dots
- **Flight line toggle**: Show/hide flight connections with airplane emoji button
- **Interactive markers**: Cities appear as you visit them with hover information
- **Responsive design**: Works on desktop and mobile devices

### 📊 Environmental Impact Tracking
- **Real-time emissions**: CO₂ calculations update as you scrub through the timeline
- **Mode-specific factors**: Different emission rates for flights, trains, cars, and ferries
  - ✈️ Flights: 0.25 kg CO₂/km
  - 🚂 Trains: 0.04 kg CO₂/km  
  - 🚗 Cars: 0.12 kg CO₂/km
  - ⛴️ Ferries: 0.12 kg CO₂/km
- **Live statistics**: Distance traveled and carbon footprint update during scrubbing

### 🎯 Advanced Features
- **Seamless scrubbing**: Timeline updates all map elements, statistics, and animations
- **Smart line management**: Flight lines appear/disappear based on timeline position
- **Country recognition**: Comprehensive mapping of cities and airport codes to countries
- **Data validation**: Prevents spurious connections between unrelated locations

### Data Format
Place your travel data in CSV format:
- `flightdiary_2025_09_15_05_15.csv` - Flight data
- `land-journey.csv` - Ground transportation data

## 🛠️ Technical Stack
- **Mapping**: Leaflet.js v1.9.4
- **Styling**: Custom CSS with glow effects and transitions
- **Animation**: JavaScript requestAnimationFrame for smooth 60fps animation
- **Data Processing**: Custom CSV parser with chronological sorting
- **Country Mapping**: Comprehensive city and airport code databases

## 📁 File Structure
```
worldOyster/
├── animated-flight-map.html     # Main application interface
├── animated-flight-map.js       # Core animation and mapping logic
├── flight-data.js              # CSV data processing utilities
├── flightdiary_*.csv           # Flight journey data
├── land-journey.csv            # Ground travel data
└── README.md                   # This file
```

## 🌟 Key Components

### AnimatedFlightMap Class
Main application controller handling:
- Timeline scrubbing and animation state
- Map rendering and marker management  
- Emission calculations and statistics
- Play/pause/loop functionality

### FlightDataManager Class
Data processing engine providing:
- CSV parsing and validation
- Chronological journey sorting
- Combined flight and ground travel data
- Date range and mode filtering

---

Built with ❤️ for travel
