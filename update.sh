pushd lifeweb
git pull
./node_modules/.bin/npx tsc
popd
pushd data/sssss
git pull
popd
git pull
./node_modules/.bin/npx tsc