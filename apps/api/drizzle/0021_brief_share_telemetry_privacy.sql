UPDATE "events"
SET "props" = jsonb_set("props", '{path}', to_jsonb('/b/:token'::text), false)
WHERE "name" = 'page.viewed'
  AND jsonb_typeof("props"->'path') = 'string'
  AND "props"->>'path' ~* '^/b/[^/]+/*$'; --