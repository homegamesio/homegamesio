aws s3 cp bundle.js s3://homegames.io/bundle.js

aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*"
