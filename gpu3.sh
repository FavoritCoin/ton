while true; do
  node send_universal.js --api tonhub --bin ./pow-miner-cuda --gpu 3 --givers 1000
  sleep 1;
done;
