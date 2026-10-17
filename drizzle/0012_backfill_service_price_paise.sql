-- Services saved before online payments, whose price was typed as a plain number ("1500"), never got an amount in paise.
-- Without it the wallet can't pay for them and the website has nothing to charge. The ₹ form was covered in 0008.
UPDATE "service"
SET "price_paise" = round(replace("price_display", ',', '')::numeric * 100)::integer
WHERE "price_paise" IS NULL
  AND "price_display" ~ '^[0-9,]+(\.[0-9]{1,2})?$';
