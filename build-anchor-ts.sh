# Assumes you have the anchor repo cloned in the parent folder
rm -rf ./node_modules/@project-serum/anchor
cd ../anchor/ts/packages/anchor
yarn && yarn build
cp ./ ../../../../helium-program-library/node_modules/@project-serum/anchor -r