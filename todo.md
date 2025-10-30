## Features/bugs

### Backend
- [x] Create backend endpoints for editting the database
- Created [Update DB](update_db.md) file on how to update DB externally
- [x] Refactor
- [x] Create backend API to update forum post for prices
- [x] Leagues: Add support for multiple leagues and allow users to select their preferred league. Add league-specific data handling.
- [ ] Expand API endpoints for more granular control or analytics.
- [ ] Async Rate Limiter: Implement an async version of the backend rate limiter for better SSE streaming performance.
- [ ] Database normalization

### Front end
- [x] Make the change indicate 7 days in the header & based on the median
- [x] Add hover effects for more details on the change graph
- [x] Account name can exceed width overlapping the whisper message
- [x] Add button to undercut price
- [x] Make the ratios based on median ratio instead of best ratio to prevent outliers
- [x] Make a dot appear in the line graph per trade pair for the latest entry (max. 7 days ago, maybe display the date too)
- [x] Refactor
- [x] UI/UX Enhancements: Add more detailed tooltips, animations, or visual feedback for user actions.
- [x] 'Enter' to submit undercut price
- [ ] Slider to buy more than a single item for a trade
- [ ] When an item is 'hot', refresh every x (30) seconds
- [ ] Mobile responsiveness
- [ ] Toast notifications


## Bugs
- [ ] Sample