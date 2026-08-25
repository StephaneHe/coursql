<?php
declare(strict_types=1);

$user = Auth::requireUser();
$card = Cards::get($routeParams['slug']);
if ($card === null) {
    Http::send(404, ['error' => 'not_found']);
}
Progress::markSolutionViewed($user['id'], $card['slug']);
$gating = $card['gating'];
$solutionSql = $gating['kind'] === 'sql' ? $gating['solutionSql'] : null;
Http::send(200, ['solution_sql' => $solutionSql, 'explanation_fr' => $gating['explanationFr']]);
