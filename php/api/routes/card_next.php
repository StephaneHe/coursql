<?php
declare(strict_types=1);

Auth::requireUser();
Http::send(200, ['next_slug' => Cards::nextSlug($routeParams['slug'])]);
