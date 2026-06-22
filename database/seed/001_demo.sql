insert into risky_images (id, image, image_tag, severity, reason, mitigation, active)
values
  (uuid_generate_v4(), 'ghcr.io/nopollops/openssl-demo:vulnerable', 'vulnerable', 'Critical', 'Known vulnerable OpenSSL demo image', 'Upgrade to ghcr.io/nopollops/openssl-demo:patched', true)
on conflict (image) do nothing;

