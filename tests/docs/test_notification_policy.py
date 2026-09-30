"""Owner policy: deployment automation must not restore Slack integrations."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]


class NotificationPolicyTests(unittest.TestCase):
    def test_deployment_automation_has_no_slack_integration(self):
        # Scan all workflow names/content, local actions, and docs helper scripts
        # so restoring a sender under a different filename also fails CI.
        paths = [ROOT / 'docs/manufacturing-os-site/README.md']
        for directory in ('.github/workflows', '.github/actions', 'scripts/docs'):
            paths.extend(path for path in (ROOT / directory).rglob('*')
                         if path.is_file() and '__pycache__' not in path.parts)
        violations = []
        for path in sorted(paths):
            relative = path.relative_to(ROOT).as_posix()
            if re.search(r'slack', relative, re.IGNORECASE):
                violations.append(relative + ': filename')
            for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                if re.search(r'slack', line, re.IGNORECASE):
                    violations.append(f'{relative}:{number}')
        self.assertEqual(violations, [],
                         'Slack is retired; remove these integration references: '
                         + ', '.join(violations))


if __name__ == '__main__':
    unittest.main()
