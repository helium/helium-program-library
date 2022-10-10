# Assumes you have the anchor repo cloned in the parent folder
rm -rf ./node_modules/@project-serum/anchor
cd ../anchor/ts/packages/anchor
git checkout 862575a6496e2d92e9e95d226bc44d7cae1594e1
yarn && yarn build
cp ./ ../../../../helium-program-library/node_modules/@project-serum/anchor -r