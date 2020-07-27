import { assertEquals } from './deps.ts';
import * as adb from './adb.ts';

Deno.test('adb shell ls /', async () => {
  const { code, out } = await adb.shell('echo hello');
  assertEquals(0, code, 'code should be 0');
  assertEquals('hello\n', out, 'output should be `hello`');
});

Deno.test('adb.pl shell which not_exist', async () => {
  try {
    for await (const _ of adb.pl.shell('which not_exist')) {
      // do nothing
    }
  } catch (e) {
    assertEquals(1, e.code, 'code should be 1');
  }
});
