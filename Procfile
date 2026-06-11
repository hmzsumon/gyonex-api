web: npm run start

realtime: ENABLE_INGESTOR=true ENABLE_STOPOUT=true STAKING_CRONS=false node --optimize_for_size --max_old_space_size=800 dist/workers/boot.js

cron: ENABLE_INGESTOR=false ENABLE_STOPOUT=false STAKING_CRONS=true node --optimize_for_size --max_old_space_size=256 dist/workers/boot.js
