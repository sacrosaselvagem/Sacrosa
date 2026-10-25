# Cria (ou reaproveita) a base de producao da Rosa Selvagem no Chatwoot. Pode rodar mais de uma vez.
# Chamado pelo instalar.sh:
#   docker compose exec -T -e DONA_NOME=... -e DONA_EMAIL=... -e DONA_SENHA=... -e ASSUNTOS_JSON=... \
#     rails bundle exec rails runner /rosa/semear-producao.rb
# Saida: linhas CHAVE=valor lidas pelo instalar.sh (tokens nao sao mostrados na tela).
require 'json'

nome  = ENV.fetch('DONA_NOME').strip
email = ENV.fetch('DONA_EMAIL').strip.downcase
senha = ENV.fetch('DONA_SENHA')
assuntos = JSON.parse(ENV.fetch('ASSUNTOS_JSON', '[]'))

conta = Account.find_or_create_by!(name: 'Rosa Selvagem') { |a| a.locale = 'pt_BR' }
conta.update!(locale: 'pt_BR') if conta.locale != 'pt_BR'

# dona
dona = User.find_by(email: email)
nova = dona.nil?
if nova
  dona = User.new(name: nome, display_name: nome, email: email, password: senha, password_confirmation: senha)
  dona.skip_confirmation!
  dona.save!
end
au = AccountUser.find_or_create_by!(account: conta, user: dona) { |x| x.role = :administrator }
au.update!(role: :administrator) unless au.administrator?

# app de plataforma: o servico de atendimento cria e gerencia as pessoas da equipe por ele
app = PlatformApp.find_or_create_by!(name: 'Atendimento Rosa Selvagem')
PlatformAppPermissible.find_or_create_by!(platform_app: app, permissible: conta)
PlatformAppPermissible.find_or_create_by!(platform_app: app, permissible: dona)

# IA do SAC: agent bot SEM outgoing_url (com um endereco que o Chatwoot nao alcanca, ele devolve a conversa
# para a equipe com "erro com o robo"). Quem responde e o servico de atendimento, pelo token do bot.
bot = AgentBot.find_or_create_by!(name: 'IA do SAC', account_id: conta.id) do |b|
  b.description = 'Filtro do atendimento: responde, escala ou ignora. Ligado e desligado pela tela de atendimento.'
end
bot.update!(outgoing_url: nil) if bot.outgoing_url.present?

# etiquetas de assunto da IA (lista do ia.mjs)
assuntos.each do |a|
  Label.find_or_create_by!(account: conta, title: a['id']) do |l|
    l.description = "#{a['nome']}: #{a['desc']}"
    l.color = '#71717A'
    l.show_on_sidebar = true
  end
end

# pula a tela de primeira instalacao do Chatwoot
Redis::Alfred.delete(Redis::Alfred::CHATWOOT_INSTALLATION_ONBOARDING)

puts "CONTA=#{conta.id}"
puts "DONA_ID=#{dona.id}"
puts "DONA_NOVA=#{nova ? 1 : 0}"
puts "TOKEN_DONA=#{dona.access_token.token}"
puts "TOKEN_PLATAFORMA=#{app.access_token.token}"
puts "BOT_ID=#{bot.id}"
puts "TOKEN_BOT=#{bot.access_token.token}"
puts "ETIQUETAS=#{Label.where(account: conta).count}"
