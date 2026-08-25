<?php
declare(strict_types=1);

/** @var array $config */
Http::send(200, ['ok' => true, 'version' => $config['version']]);
