# List Tools - Chrome Web Store Description

## How it works

- Click the extension icon in your browser toolbar
- Select **"Coordinate Calculation"** tab: Enter latitude/longitude coordinates (e.g., `37.775,-122.418`), choose grid resolution (0-15), and optionally set ring expansion (0-10)
- Select **"Grid Calculation"** tab: Enter H3 grid index to get detailed grid information
- Results display instantly with complete grid properties
- Use the copy button to export vertex coordinates
- Add custom tool links for quick access to frequently-used websites

## Privacy and data

- All calculations run locally in your browser using the H3 library
- No data is sent to external servers—your coordinates and indices remain private
- Custom tools and links are stored locally in browser storage
- No user data collection or analytics tracking
- Complete offline functionality

## Who it's for

- **GIS developers** who need to convert coordinates to H3 indices and verify grid properties
- **Data scientists** working with geospatial data aggregation and analysis
- **Logistics planners** calculating delivery zones and service coverage areas
- **Map application developers** prototyping and debugging location-based features
- **Researchers** studying grid indexing algorithms and spatial data
- **Anyone** who works with geographic coordinates and needs professional H3 grid calculations

## Permission rationale

- **tabs**: To open custom tool links in new browser tabs when users click on tools they've added. This enables seamless access to user-selected geospatial tools. No tab content is read or modified—only opens new tabs upon explicit user action.

## Elevator pitch

**Stop calculating. Start analyzing.** List Tools gives you instant H3 grid index computation with detailed metrics, ring expansion analysis, and custom tool management—all running locally for privacy and speed. Convert coordinates, analyze grids, and access your tools in seconds.
