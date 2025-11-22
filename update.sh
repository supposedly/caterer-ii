pushd lifeweb
git pull
./node_modules/.bin/tsc
popd
pushd data/sssss
git pull
popd
git pull
./node_modules/.bin/tsc