-- Employee feedback, round two: a mark out of 10 instead of 1-5 stars, a tone (Positive / Neutral /
-- Negative) and an optional reward. Feedback saved before keeps its meaning: its stars are doubled
-- (4 stars -> 8/10) and its tone stays empty.
--
-- Run ONCE. The first statement fails on a second run (the columns already exist), so if your
-- runner stops on the first error, the doubling below cannot happen twice.

ALTER TABLE `employee_feedback`
  ADD COLUMN `sentiment` ENUM('Positive', 'Neutral', 'Negative') NULL AFTER `rating`,
  ADD COLUMN `reward` VARCHAR(500) NULL AFTER `sentiment`,
  DROP CHECK `chk_ef_rating`;

UPDATE `employee_feedback` SET `rating` = `rating` * 2;

ALTER TABLE `employee_feedback`
  ADD CONSTRAINT `chk_ef_rating` CHECK (`rating` BETWEEN 1 AND 10);
