#!/bin/bash

gpg --batch --passphrase $1 --quick-gen-key migration default default
gpg --export-secret-keys -a migration > /data/migration.gpg
gpg --sign --armor -r migration --encrypt /data/keypairs.tar.gz
