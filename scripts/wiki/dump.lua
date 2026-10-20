-- Evaluates the wiki's Module:Sequence/standard and prints it as JSON.
-- The module only `require`s a helper of annotation strings and a noteWrap()
-- function. We stub it: annotations become empty, notes pass through.
local path = arg[1]
local src = assert(io.open(path)):read('a')
local helper = setmetatable({ noteWrap = function(s) return s end }, { __index = function() return '' end })
local env = setmetatable({ require = function() return helper end }, { __index = _G })
local chunk = assert(load(src, 'standard', 't', env))
local data = chunk()

local function esc(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return map[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

local function enc(v)
  local t = type(v)
  if t == 'string' then return esc(v) end
  if t == 'number' or t == 'boolean' then return tostring(v) end
  if t == 'table' then
    if #v > 0 then
      local out = {}
      for i = 1, #v do out[i] = enc(v[i]) end
      return '[' .. table.concat(out, ',') .. ']'
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local out = {}
    for _, k in ipairs(keys) do out[#out + 1] = esc(k) .. ':' .. enc(v[k] == nil and v[tonumber(k)] or v[k]) end
    return '{' .. table.concat(out, ',') .. '}'
  end
  return 'null'
end

io.write(enc(data))
