# Postgres + pgTAP for Cairn.
#
# Extends the upstream postgres:16 image with pgTAP (the SQL test
# framework) and pg_prove (the Perl harness that runs *.sql tests and
# emits TAP). Both are needed by `scripts/test-db.sh` to run the
# database test suite documented in docs/testing.md.
#
# The pgTAP extension is only installed on demand into the test
# database (CREATE EXTENSION pgtap), never into the dev database, so
# this image is safe to use for both dev and test.

FROM postgres:16

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		postgresql-16-pgtap \
		perl \
		libtap-parser-sourcehandler-pgtap-perl \
	&& rm -rf /var/lib/apt/lists/*
